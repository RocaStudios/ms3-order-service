import { PedidoRepository } from "../../domain/repositories/pedidoRepository";
import { ProductoPedidoRepository } from "../../domain/repositories/productoPedidoRepository";
import { PagoRepository } from "../../domain/repositories/pagoRepository";
import { PagoDetalleRepository } from "../../domain/repositories/pagoDetalleRepository";
import { MetodoPagoRepository } from "../../domain/repositories/metodoPagoRepository";
import { Pedido } from "../../domain/models/pedido";
import { Pago } from "../../domain/models/pago";
import { MetodoPago } from "../../domain/models/metodoPago";
import { generarReciboPDF } from "../../utils/pdfGenerator";
import { TableService } from "../apis/tableService";
import { InventoryService } from "../apis/inventoryService";
import { ClientService } from "../apis/clientService";
import { PriceCalculatorService } from "../priceCalculatorService";
import { Op } from "sequelize";
import { ServiceResult } from "../../types/pedido.types";
import { sequelizeInstance } from "../../config/db";
import { Transaction } from "sequelize";
import { AppError } from "../../middlewares/error.middleware";

/**
 * PaymentService - Handles payment operations
 * Responsibility: Process payments with transactions and validations
 */
export class PaymentService {
  private readonly METODOS_PERMITIDOS = new Set(["efectivo", "tarjeta", "transferencia"]);

  constructor(
    private pedidoRepository: PedidoRepository,
    private productoPedidoRepository: ProductoPedidoRepository,
    private pagoRepository: PagoRepository,
    private pagoDetalleRepository: PagoDetalleRepository,
    private metodoPagoRepository: MetodoPagoRepository,
    private tableService: TableService,
    private inventoryService: InventoryService,
    private clientService: ClientService,
    private priceCalculatorService: PriceCalculatorService
  ) {}

  private normalizeMetodoNombre(nombre: string): string {
    return nombre
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  private toCents(value: number): number {
    return Math.round(Number(value) * 100);
  }

  /**
   * Register payment for order (CU39/CU40) - WITH TRANSACTION
   * Critical operation: reduces inventory, registers payment, updates order
   */
  async registerPayment(
    idPedido: number,
    idUsuario: number,
    paymentInput: {
      idMetodoPago?: number;
      metodos?: Array<{ idMetodoPago: number; monto: number }>;
      montoRecibidoEfectivo?: number;
    },
    direccionEntrega?: string,
    accessToken?: string
  ): Promise<ServiceResult> {
    const transaction: Transaction = await sequelizeInstance.transaction();

    try {
      const pedido = await this.pedidoRepository.findById(idPedido);

      if (!pedido) {
        await transaction.rollback();
        return { 
          status: 404, 
          message: "El pedido no existe" 
        };
      }

      if (pedido.idUsuario !== idUsuario) {
        await transaction.rollback();
        return {
          status: 403,
          message: "No tiene permiso para pagar este pedido"
        };
      }

      if (pedido.estado !== 'sin_confirmar' && pedido.estado !== 'pendiente') {
        await transaction.rollback();
        return { 
          status: 400, 
          message: `El pedido no puede ser pagado. Estado actual: ${pedido.estado}` 
        };
      }

      const pagosExistentes = await this.pagoRepository.findByPedido(idPedido);
      if (pagosExistentes.length > 0) {
        await transaction.rollback();
        return {
          status: 400,
          message: "El pedido ya tiene un pago registrado"
        };
      }

      const paymentLinesInput = Array.isArray(paymentInput.metodos) && paymentInput.metodos.length > 0
        ? paymentInput.metodos
        : (paymentInput.idMetodoPago
          ? [{ idMetodoPago: Number(paymentInput.idMetodoPago), monto: 0 }]
          : []);

      if (paymentLinesInput.length === 0) {
        await transaction.rollback();
        return {
          status: 400,
          message: "Debe proporcionar al menos un método de pago"
        };
      }

      for (const linea of paymentLinesInput) {
        if (!linea.idMetodoPago || !Number.isInteger(Number(linea.idMetodoPago))) {
          await transaction.rollback();
          return {
            status: 400,
            message: "Cada método debe incluir un idMetodoPago válido"
          };
        }
      }

      const metodosPagoPorId = new Map<number, MetodoPago>();
      for (const linea of paymentLinesInput) {
        const metodo = await this.metodoPagoRepository.findById(Number(linea.idMetodoPago));
        if (!metodo) {
          await transaction.rollback();
          return {
            status: 400,
            message: `Método de pago no válido para id ${linea.idMetodoPago}`
          };
        }

        const metodoNormalizado = this.normalizeMetodoNombre(metodo.nombre);
        if (!this.METODOS_PERMITIDOS.has(metodoNormalizado)) {
          await transaction.rollback();
          return {
            status: 400,
            message: `Método de pago no permitido: ${metodo.nombre}. Permitidos: efectivo, tarjeta, transferencia`
          };
        }

        metodosPagoPorId.set(Number(linea.idMetodoPago), metodo);
      }

      const productos = await this.productoPedidoRepository.findByPedido(idPedido);

      if (productos.length === 0) {
        await transaction.rollback();
        return { 
          status: 400, 
          message: "El pedido no tiene productos" 
        };
      }

      // Calculate total with promotions
      let totalConPromociones = 0;
      for (const productoPedido of productos) {
        try {
          const calculoPromocion = await this.priceCalculatorService.calcularPrecioConPromocion(
            productoPedido.idProducto,
            productoPedido.cantidad,
            accessToken
          );

          const subtotalConPromocion = calculoPromocion.precioFinal * productoPedido.cantidad;
          totalConPromociones += subtotalConPromocion;

          await this.productoPedidoRepository.update(productoPedido.idProductoPedido, {
            precioUnitario: calculoPromocion.precioFinal,
            subtotal: subtotalConPromocion
          });
        } catch (error) {
          console.error(`Error al calcular promoción para producto ${productoPedido.idProducto}:`, error);
          totalConPromociones += Number(productoPedido.subtotal);
        }
      }
      totalConPromociones = Number(totalConPromociones.toFixed(2));

      totalConPromociones = Math.max(0, Number(totalConPromociones.toFixed(2)));

      const normalizedPaymentLines = paymentLinesInput.map((linea) => ({
        idMetodoPago: Number(linea.idMetodoPago),
        monto: Number(linea.monto || 0)
      }));

      const isLegacyPayload = !!paymentInput.idMetodoPago && (!paymentInput.metodos || paymentInput.metodos.length === 0);
      if (isLegacyPayload) {
        normalizedPaymentLines[0].monto = totalConPromociones;
      }

      for (const linea of normalizedPaymentLines) {
        if (linea.monto <= 0) {
          await transaction.rollback();
          return {
            status: 400,
            message: `El monto para el método ${linea.idMetodoPago} debe ser mayor a 0`
          };
        }
      }

      const totalMetodos = normalizedPaymentLines.reduce((acc, item) => acc + this.toCents(item.monto), 0);
      const totalPedidoCentavos = this.toCents(totalConPromociones);

      if (totalMetodos !== totalPedidoCentavos) {
        await transaction.rollback();
        return {
          status: 400,
          message: `La suma de los métodos (${(totalMetodos / 100).toFixed(2)}) debe ser igual al total del pedido (${(totalPedidoCentavos / 100).toFixed(2)})`
        };
      }

      const montoEfectivoAsignado = normalizedPaymentLines.reduce((acc, linea) => {
        const nombreMetodo = metodosPagoPorId.get(linea.idMetodoPago)?.nombre || '';
        const esEfectivo = this.normalizeMetodoNombre(nombreMetodo) === 'efectivo';
        return esEfectivo ? acc + Number(linea.monto) : acc;
      }, 0);

      let montoRecibidoEfectivo: number | null = null;
      let vuelto = 0;

      if (montoEfectivoAsignado > 0 && paymentInput.montoRecibidoEfectivo !== undefined) {
        montoRecibidoEfectivo = Number(paymentInput.montoRecibidoEfectivo);
        if (Number.isNaN(montoRecibidoEfectivo) || montoRecibidoEfectivo <= 0) {
          await transaction.rollback();
          return {
            status: 400,
            message: 'montoRecibidoEfectivo debe ser un número mayor a 0'
          };
        }

        if (this.toCents(montoRecibidoEfectivo) < this.toCents(montoEfectivoAsignado)) {
          await transaction.rollback();
          return {
            status: 400,
            message: `El monto recibido en efectivo ($${montoRecibidoEfectivo.toFixed(2)}) no cubre el monto en efectivo del pago ($${montoEfectivoAsignado.toFixed(2)})`
          };
        }

        vuelto = Number((montoRecibidoEfectivo - montoEfectivoAsignado).toFixed(2));
      }

      let direccionFinal = direccionEntrega || pedido.direccionEntrega || '';

      // Validate stock BEFORE processing payment
      for (const productoPedido of productos) {
        const productoActual = await this.inventoryService.getProductoById(
          productoPedido.idProducto,
          accessToken
        );

        if (!productoActual || !productoActual.activo) {
          await transaction.rollback();
          return {
            status: 400,
            message: `El producto con ID ${productoPedido.idProducto} ya no está disponible`
          };
        }

        if (productoActual.stockActual < productoPedido.cantidad) {
          await transaction.rollback();
          return {
            status: 400,
            message: `Stock insuficiente para el producto con ID ${productoPedido.idProducto}. Disponible: ${productoActual.stockActual}, Requerido: ${productoPedido.cantidad}`
          };
        }
      }

      // CRITICAL: Reduce stock atomically
      try {
        for (const productoPedido of productos) {
          await this.inventoryService.reducirStock(
            productoPedido.idProducto,
            productoPedido.cantidad,
            accessToken
          );
        }
      } catch (stockError: any) {
        await transaction.rollback();
        return {
          status: 500,
          message: `Error al reducir inventario: ${stockError.message}`
        };
      }

      // Register payment
      const pago = await this.pagoRepository.create({
        idPedido,
        idMetodoPago: normalizedPaymentLines[0].idMetodoPago,
        monto: totalConPromociones,
        fechaPago: new Date(),
        urlComprobante: ''
      });

      for (const linea of normalizedPaymentLines) {
        await this.pagoDetalleRepository.create({
          idPago: pago.idPago,
          idMetodoPago: linea.idMetodoPago,
          monto: Number(linea.monto.toFixed(2))
        });
      }

      const estadoFinalPedido = pedido.canalVenta === 'fisico' ? 'entregado' : 'pendiente';

      // Para pedidos POS (canal fisico) se marca como entregado al registrar el pago.
      await this.pedidoRepository.update(idPedido, {
        total: totalConPromociones,
        estado: estadoFinalPedido,
        direccionEntrega: direccionFinal
      });

      const pedidoActualizado = await this.pedidoRepository.findById(idPedido) as Pedido;

      if (pedidoActualizado.idMesa) {
        try {
          await this.tableService.updateMesaEstado(
            pedidoActualizado.idMesa,
            { estado: 'Disponible' },
            accessToken
          );
        } catch (error) {
          console.warn(`No se pudo actualizar la mesa ${pedidoActualizado.idMesa} a Disponible tras el pago.`);
        }
      }

      // Generate PDF receipt
      let rutaPDF: string;

      const productIds = [...new Set(productos.map((p) => p.idProducto))];
      const productNamesById = new Map<number, string>();
      try {
        const productResults = await Promise.all(
          productIds.map(async (idProducto) => {
            const product = await this.inventoryService.getProductoById(idProducto, accessToken);
            return { idProducto, nombre: product?.nombre || `Producto ${idProducto}` };
          })
        );

        productResults.forEach((item) => productNamesById.set(item.idProducto, item.nombre));
      } catch (error) {
        console.error("Error al obtener nombres de productos para recibo:", error);
      }

      try {
        rutaPDF = await generarReciboPDF({
          pedido: pedidoActualizado,
          productos: productos,
          nombresProductos: productNamesById,
          metodosPago: normalizedPaymentLines.map((linea) => ({
            nombreMetodo: metodosPagoPorId.get(linea.idMetodoPago)?.nombre || `Método ${linea.idMetodoPago}`,
            monto: Number(linea.monto.toFixed(2))
          })),
          totalFinal: totalConPromociones,
          montoRecibidoEfectivo: montoRecibidoEfectivo ?? undefined,
          vuelto: vuelto > 0 ? vuelto : undefined
        });

        await this.pagoRepository.update(pago.idPago, {
          urlComprobante: rutaPDF
        });
      } catch (error: any) {
        console.error("Error al generar PDF:", error);
        await transaction.rollback();
        return { 
          status: 500, 
          message: "Pago registrado pero error al generar recibo PDF" 
        };
      }

      await transaction.commit();

      const pagoFinal = await this.pagoRepository.findById(pago.idPago) as Pago;

      return {
        status: 201,
        data: {
          success: true,
          message: "Pago registrado exitosamente",
          data: {
            pedido: {
              idPedido: pedidoActualizado.idPedido,
              total: pedidoActualizado.total,
              estado: pedidoActualizado.estado,
              canalVenta: pedidoActualizado.canalVenta,
              tipoAtencion: pedidoActualizado.tipoAtencion,
              fechaPedido: pedidoActualizado.fechaPedido,
              idMesa: pedidoActualizado.idMesa
            },
            pago: {
              idPago: pagoFinal.idPago,
              urlComprobante: pagoFinal.urlComprobante,
              monto: pagoFinal.monto,
              fechaPago: pagoFinal.fechaPago,
              idPedido: pagoFinal.idPedido,
              idMetodoPago: pagoFinal.idMetodoPago,
              detalles: normalizedPaymentLines.map((linea) => ({
                idMetodoPago: linea.idMetodoPago,
                nombre: metodosPagoPorId.get(linea.idMetodoPago)?.nombre || `Método ${linea.idMetodoPago}`,
                monto: Number(linea.monto.toFixed(2))
              })),
              montoRecibidoEfectivo: montoRecibidoEfectivo ?? undefined,
              vuelto: vuelto > 0 ? vuelto : undefined
            },
            rutaPDF
          }
        }
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * List pending payment orders (CU39)
   */
  async listPendingPaymentOrders(
    page: number = 1,
    limit: number = 20,
    idUsuario?: number
  ): Promise<{ pedidos: Pedido[]; total: number }> {
    const offset = (page - 1) * limit;
    const whereClause: any = {
      estado: 'sin_confirmar'
    };

    if (idUsuario) {
      whereClause.idUsuario = idUsuario;
    }

    const { rows: pedidos, count: total } = await this.pedidoRepository.findAndCountAll({
      where: whereClause,
      order: [['fechaPedido', 'DESC']],
      limit,
      offset
    });

    return { pedidos, total };
  }

  /**
   * List payment methods (CU40)
   */
  async listPaymentMethods(): Promise<MetodoPago[]> {
    return await this.metodoPagoRepository.findAll();
  }

  /**
   * Get all payments (admin only)
   */
  async getAllPayments(
    page: number = 1,
    limit: number = 20
  ): Promise<{ pagos: Pago[]; total: number }> {
    const offset = (page - 1) * limit;
    const pagos = await this.pagoRepository.findAllWithRelations({}, {});
    const total = pagos.length;
    const paginatedPagos = pagos.slice(offset, offset + limit);

    return { pagos: paginatedPagos, total };
  }

  /**
   * Create payment method
   */
  async createPaymentMethod(nombre: string): Promise<ServiceResult> {
    const metodoExistente = await this.metodoPagoRepository.findByNombre(nombre);
    
    if (metodoExistente) {
      return {
        status: 400,
        message: "Ya existe un método de pago con ese nombre"
      };
    }

    const nuevoMetodo = await this.metodoPagoRepository.create({ nombre });

    return {
      status: 201,
      data: {
        success: true,
        message: "Método de pago creado exitosamente",
        data: {
          idMetodo: nuevoMetodo.idMetodo,
          nombre: nuevoMetodo.nombre
        }
      }
    };
  }

  /**
   * Get payment method by ID
   */
  async getPaymentMethodById(idMetodo: number): Promise<MetodoPago | null> {
    return await this.metodoPagoRepository.findById(idMetodo);
  }

  /**
   * Update payment method
   */
  async updatePaymentMethod(idMetodo: number, nombre: string): Promise<ServiceResult> {
    const metodo = await this.metodoPagoRepository.findById(idMetodo);

    if (!metodo) {
      return {
        status: 404,
        message: "Método de pago no encontrado"
      };
    }

    const metodoConMismoNombre = await this.metodoPagoRepository.findByNombre(nombre);
    
    if (metodoConMismoNombre && metodoConMismoNombre.idMetodo !== idMetodo) {
      return {
        status: 400,
        message: "Ya existe otro método de pago con ese nombre"
      };
    }

    await this.metodoPagoRepository.update(idMetodo, { nombre });
    const metodoActualizado = await this.metodoPagoRepository.findById(idMetodo);

    return {
      status: 200,
      data: {
        success: true,
        message: "Método de pago actualizado exitosamente",
        data: {
          idMetodo: metodoActualizado!.idMetodo,
          nombre: metodoActualizado!.nombre
        }
      }
    };
  }

  /**
   * Delete payment method
   */
  async deletePaymentMethod(idMetodo: number): Promise<ServiceResult> {
    const metodo = await this.metodoPagoRepository.findById(idMetodo);

    if (!metodo) {
      return {
        status: 404,
        message: "Método de pago no encontrado"
      };
    }

    const pagosConMetodo = await this.pagoRepository.findAll({
      where: { idMetodoPago: idMetodo }
    });

    const detallesConMetodo = await this.pagoDetalleRepository.existsByMetodoPago(idMetodo);

    if (pagosConMetodo.length > 0 || detallesConMetodo) {
      return {
        status: 400,
        message: "No se puede eliminar el método de pago porque tiene pagos asociados"
      };
    }

    await this.metodoPagoRepository.delete(idMetodo);

    return {
      status: 200,
      data: {
        success: true,
        message: "Método de pago eliminado exitosamente"
      }
    };
  }

  /**
   * Get payment history with filters (CU041)
   */
  async getPaymentHistory(
    page: number = 1,
    limit: number = 20,
    filtros: {
      fechaInicio?: Date;
      fechaFin?: Date;
      idMetodoPago?: number;
      estado?: string;
      idUsuario?: number;
    }
  ): Promise<{ pagos: Pago[]; total: number }> {
    const whereClausePago: any = {};
    const whereClausePedido: any = {};

    if (filtros.fechaInicio && filtros.fechaFin) {
      whereClausePago.fechaPago = {
        [Op.between]: [filtros.fechaInicio, filtros.fechaFin]
      };
    } else if (filtros.fechaInicio) {
      whereClausePago.fechaPago = {
        [Op.gte]: filtros.fechaInicio
      };
    } else if (filtros.fechaFin) {
      whereClausePago.fechaPago = {
        [Op.lte]: filtros.fechaFin
      };
    }

    if (filtros.estado) {
      whereClausePedido.estado = filtros.estado;
    }

    if (filtros.idUsuario) {
      whereClausePedido.idUsuario = filtros.idUsuario;
    }

    const offset = (page - 1) * limit;

    const pagos = await this.pagoRepository.findAllWithRelations(whereClausePago, whereClausePedido);
    
    // Manual pagination since findAllWithRelations doesn't support limit/offset directly
    const pagosFiltrados = filtros.idMetodoPago
      ? pagos.filter((pago) => (pago.detalles || []).some((detalle) => detalle.idMetodoPago === filtros.idMetodoPago))
      : pagos;

    const total = pagosFiltrados.length;
    const paginatedPagos = pagosFiltrados.slice(offset, offset + limit);

    return { pagos: paginatedPagos, total };
  }

  /**
   * Get payment detail (CU041)
   */
  async getPaymentDetail(idPago: number): Promise<Pago> {
    const pago = await this.pagoRepository.findByIdWithRelations(idPago);
    if (!pago) {
      throw new AppError(`Pago con ID ${idPago} no encontrado`, 404);
    }
    return pago;
  }

  async getReceiptByOrderId(idPedido: number, idUsuario: number): Promise<{ pago: Pago; path: string }> {
    const pagos = await this.pagoRepository.findByPedido(idPedido);
    if (!pagos || pagos.length === 0) {
      throw new AppError(`No se encontró ningún pago para el pedido ${idPedido}`, 404);
    }

    const pago = pagos.find(p => p.idPedido === idPedido) || pagos[0];
    
    const pedido = await this.pedidoRepository.findById(idPedido);
    if (!pedido) {
      throw new AppError(`Pedido con ID ${idPedido} no encontrado`, 404);
    }

    if (pedido.idUsuario !== idUsuario) {
      throw new AppError(`No tienes permiso para acceder a este comprobante`, 403);
    }

    if (!pago.urlComprobante) {
      throw new AppError(`El pago no tiene comprobante generado`, 404);
    }

    const fs = require('fs');
    const path = require('path');
    const rutaArchivo = path.resolve(pago.urlComprobante);

    if (!fs.existsSync(rutaArchivo)) {
      throw new AppError(`Archivo de comprobante no encontrado`, 404);
    }

    return { pago, path: rutaArchivo };
  }
}
