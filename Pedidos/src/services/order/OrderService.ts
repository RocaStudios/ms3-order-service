import { PedidoRepository } from "../../domain/repositories/pedidoRepository";
import { ProductoPedidoRepository } from "../../domain/repositories/productoPedidoRepository";
import { PagoRepository } from "../../domain/repositories/pagoRepository";
import { InventoryService } from "../apis/inventoryService";
import { ClientService } from "../apis/clientService";
import { TableService } from "../apis/tableService";
import { PriceCalculatorService } from "../priceCalculatorService";
import { PromotionService } from "../apis/promotionService";
import { sendOrderConfirmationEmail } from "../apis/emailService";
import { generarReciboPDF } from "../../utils/pdfGenerator";
import { Pedido } from "../../domain/models/pedido";
import { ProductoPedido } from "../../domain/models/productoPedido";
import { Pago } from "../../domain/models/pago";
import { ServiceResult } from "../../types/pedido.types";
import { sequelizeInstance } from "../../config/db";
import { Transaction } from "sequelize";

export interface ConfirmOrderData {
  direccionEntrega?: string;
}

export interface ConfirmOrderResult {
  pedido: Pedido;
  pago: Pago;
  mensaje: string;
}

export interface ProductInput {
  idProducto: number;
  cantidad: number;
}

export interface CreateCustomerOrderResult {
  pedido: Pedido;
  productos: ProductoPedido[];
  rutaPDF: string;
  mensaje: string;
}

/**
 * OrderService - Handles main order operations
 * Responsibility: Create, confirm, update orders with business logic
 */
export class OrderService {
  constructor(
    private pedidoRepository: PedidoRepository,
    private productoPedidoRepository: ProductoPedidoRepository,
    private pagoRepository: PagoRepository,
    private inventoryService: InventoryService,
    private clientService: ClientService,
    private tableService: TableService,
    private priceCalculatorService: PriceCalculatorService,
    private promotionService: PromotionService
  ) { }

  /**
   * Confirm order (CU035)
   */
  async confirmOrder(
    idUsuario: number,
    data: ConfirmOrderData,
    accessToken?: string
  ): Promise<ServiceResult> {
    const cliente = await this.clientService.getClientById(idUsuario, accessToken);
    if (!cliente) {
      return {
        status: 403,
        message: "El usuario no está registrado como cliente"
      };
    }

    const carritoPendiente = await this.pedidoRepository.findOne({
      where: {
        idUsuario,
        estado: 'sin_confirmar'
      }
    });

    if (!carritoPendiente) {
      return {
        status: 400,
        message: "No hay productos disponibles para realizar pedidos"
      };
    }

    const productosDelPedido = await this.productoPedidoRepository.findByPedido(
      carritoPendiente.idPedido
    );

    if (productosDelPedido.length === 0) {
      return {
        status: 400,
        message: "No hay productos disponibles para realizar pedidos"
      };
    }

    const validacion = await this.validateProductAvailability(productosDelPedido, accessToken);
    if (validacion.status !== 200) {
      return validacion;
    }

    const totalConPromociones = await this.calculateTotalWithPromotions(
      productosDelPedido,
      accessToken
    );

    let direccionEntrega = data.direccionEntrega;
    if (!direccionEntrega) {
      direccionEntrega = cliente.direccion || '';
    }

    await this.pedidoRepository.update(carritoPendiente.idPedido, {
      total: totalConPromociones,
      estado: 'pendiente',
      fechaPedido: new Date(),
      direccionEntrega
    });

    const pedidoFinal = await this.pedidoRepository.findById(
      carritoPendiente.idPedido
    ) as Pedido;

    try {
      const productosParaEmail = productosDelPedido.map(p => ({
        idProducto: p.idProducto,
        cantidad: p.cantidad,
        precioUnitario: p.precioUnitario,
        subtotal: p.subtotal
      }));

      await sendOrderConfirmationEmail({
        email: cliente.email,
        nombreCliente: cliente.nombre,
        numeroPedido: pedidoFinal.idPedido,
        productos: productosParaEmail,
        total: pedidoFinal.total,
        estado: pedidoFinal.estado,
        direccionEntrega: pedidoFinal.direccionEntrega,
        metodoPago: 'Pendiente de pago'
      });
    } catch (emailError) {
      console.error('Error al enviar email de confirmación:', emailError);
    }

    return {
      status: 200,
      data: {
        success: true,
        message: "Pedido confirmado exitosamente. Ahora puede proceder con el pago.",
        data: {
          pedido: {
            idPedido: pedidoFinal.idPedido,
            idUsuario: pedidoFinal.idUsuario,
            total: pedidoFinal.total,
            estado: pedidoFinal.estado,
            canalVenta: pedidoFinal.canalVenta,
            tipoAtencion: pedidoFinal.tipoAtencion,
            fechaPedido: pedidoFinal.fechaPedido,
            direccionEntrega: pedidoFinal.direccionEntrega,
            idMesa: pedidoFinal.idMesa
          }
        }
      }
    };
  }

  /**
   * Create customer order (CU48) - WITH TRANSACTION
   */
  async createCustomerOrder(
    idUsuarioEmpleado: number,
    productos: ProductInput[],
    idMesa?: number,
    accessToken?: string
  ): Promise<CreateCustomerOrderResult> {
    const transaction: Transaction = await sequelizeInstance.transaction();

    try {
      if (!productos || productos.length === 0) {
        throw new Error("Debe seleccionar al menos un producto");
      }

      const productosValidados = [];
      for (const item of productos) {
        if (item.cantidad <= 0) {
          throw new Error("La cantidad debe ser mayor a 0");
        }

        const producto = await this.inventoryService.getProductoById(item.idProducto, accessToken);

        if (!producto || !producto.activo) {
          throw new Error(`El producto con ID ${item.idProducto} no está disponible`);
        }

        if (producto.stockActual < item.cantidad) {
          throw new Error(`Stock insuficiente para el producto ${item.idProducto}. Stock disponible: ${producto.stockActual}`);
        }

        const calculoPromocion = await this.priceCalculatorService.calcularPrecioConPromocion(
          item.idProducto,
          item.cantidad,
          accessToken
        );

        // Lógica de validación de promoción (Ruta 1 ms5) solicitada
        const promoData = await this.promotionService?.checkProductoPromocionActiva(item.idProducto, accessToken) || { hasPromotion: false, promotion: null };
        let promocionAplicada = false;
        let idPromocion = null;
        let cantidadMinimaRequerida = null;

        if (promoData.hasPromotion && promoData.promotion) {
          cantidadMinimaRequerida = promoData.promotion.cantidad_minima;
          const meetsMinimum = item.cantidad >= promoData.promotion.cantidad_minima;
          promocionAplicada = meetsMinimum;
          idPromocion = meetsMinimum ? promoData.promotion.id : null;
        }

        productosValidados.push({
          idProducto: item.idProducto,
          cantidad: item.cantidad,
          precioUnitario: calculoPromocion.precioFinal,
          promocionAplicada,
          idPromocion,
          cantidadMinimaRequerida
        });
      }

      let nombreMesa: string | undefined;
      if (idMesa) {
        const mesas = await this.tableService.getAllMesas(accessToken);
        const mesa = mesas.find(m => m.idMesa === idMesa);

        if (!mesa) {
          throw new Error(`La mesa con ID ${idMesa} no existe`);
        }

        const pedidoAbierto = await this.pedidoRepository.findLatestOpenByMesa(idMesa);
        if (pedidoAbierto) {
          const numeroMesa = (mesa as any).numero ?? (mesa as any).numeroMesa ?? idMesa;
          throw new Error(`La mesa ${numeroMesa} no está disponible. Estado actual: Ocupada`);
        }

        const numeroMesa = (mesa as any).numero ?? (mesa as any).numeroMesa ?? idMesa;
        nombreMesa = `Mesa ${numeroMesa}`;
      }

      const pedido = await this.pedidoRepository.create({
        idUsuario: idUsuarioEmpleado,
        total: 0,
        estado: 'sin_confirmar',
        canalVenta: 'fisico',
        tipoAtencion: idMesa ? 'local' : 'llevar',
        fechaPedido: new Date(),
        idMesa: idMesa
      });

      const productosCreados: ProductoPedido[] = [];
      let totalPedido = 0;

      for (const item of productosValidados) {
        const subtotal = item.precioUnitario * item.cantidad;

        const productoPedido = await this.productoPedidoRepository.create({
          idPedido: pedido.idPedido,
          idProducto: item.idProducto,
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
          subtotal: subtotal,
          promocionAplicada: item.promocionAplicada,
          idPromocion: item.idPromocion,
          cantidadMinimaRequerida: item.cantidadMinimaRequerida
        });

        productosCreados.push(productoPedido);
        totalPedido += subtotal;
      }

      await this.pedidoRepository.update(pedido.idPedido, {
        total: Number(totalPedido.toFixed(2))
      });

      const pedidoActualizado = await this.pedidoRepository.findById(pedido.idPedido) as Pedido;

      let rutaPDF: string;
      try {
        rutaPDF = await generarReciboPDF({
          pedido: pedidoActualizado,
          productos: productosCreados,
          nombreMesa: nombreMesa
        });
      } catch (error: any) {
        console.error("Error al generar PDF:", error);
        throw new Error("Pedido creado pero error al generar recibo PDF");
      }

      if (idMesa) {
        try {
          await this.tableService.updateMesaEstado(idMesa, { estado: 'Ocupada' }, accessToken);
        } catch (error: any) {
          console.error("Error al actualizar estado de mesa:", error);
          throw new Error("Pedido creado pero error al actualizar estado de la mesa");
        }
      }

      await transaction.commit();

      return {
        pedido: pedidoActualizado,
        productos: productosCreados,
        rutaPDF: rutaPDF,
        mensaje: "Pedido registrado exitosamente"
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Add product to order (CU37)
   */
  async addProductToOrder(
    idPedido: number,
    idProducto: number,
    cantidad: number,
    accessToken?: string
  ): Promise<{ pedido: Pedido; productoPedido: ProductoPedido; mensaje: string }> {
    if (cantidad <= 0) {
      throw new Error("La cantidad debe ser mayor a 0");
    }

    const pedido = await this.pedidoRepository.findById(idPedido);

    if (!pedido) {
      throw new Error("El pedido no existe");
    }

    if (pedido.estado === 'cancelado') {
      throw new Error("No se pueden agregar productos a un pedido cancelado");
    }

    const producto = await this.inventoryService.getProductoById(idProducto, accessToken);

    if (!producto || !producto.activo) {
      throw new Error("El producto seleccionado no está disponible");
    }

    if (producto.stockActual < cantidad) {
      // VALIDACIÓN ADICIONAL: Asegurar que stockActual es válido
      if (typeof producto.stockActual !== 'number' || producto.stockActual < 0) {
        console.error(
          `[OrderService] ⚠️ Stock inválido detectado para producto ${idProducto}:`,
          { stockActual: producto.stockActual, tipo: typeof producto.stockActual }
        );
        throw new Error(`No se pudo validar el stock para el producto ${idProducto}. Stock: ${producto.stockActual}`);
      }
      
      throw new Error(`Stock insuficiente para el producto ${idProducto}. Disponible: ${producto.stockActual}, solicitado: ${cantidad}`);
    }

    const productoExistente = await this.productoPedidoRepository.findOne({
      where: {
        idPedido,
        idProducto
      }
    });

    let productoPedido: ProductoPedido;

    // Determinar la cantidad total final para aplicar la lógica de promociones por volumen o por unidad
    const nuevaCantidad = productoExistente ? productoExistente.cantidad + cantidad : cantidad;

    if (producto.stockActual < nuevaCantidad) {
      throw new Error(
        `Stock insuficiente para el producto ${idProducto}. ` +
        `Disponible: ${producto.stockActual}, solicitado total: ${nuevaCantidad}`
      );
    }

    // Calcular el precio real que se aplica a este producto (considerando promociones y descuentos)
    const calculoPromocion = await this.priceCalculatorService.calcularPrecioConPromocion(
      idProducto,
      nuevaCantidad,
      accessToken
    );
    const precioUnitario = calculoPromocion.precioFinal;

    if (productoExistente) {
      const nuevoSubtotal = nuevaCantidad * precioUnitario;

      await this.productoPedidoRepository.update(
        productoExistente.idProductoPedido,
        {
          cantidad: nuevaCantidad,
          subtotal: nuevoSubtotal,
          precioUnitario
        }
      );

      productoPedido = await this.productoPedidoRepository.findById(
        productoExistente.idProductoPedido
      ) as ProductoPedido;
    } else {
      const subtotal = cantidad * precioUnitario;

      productoPedido = await this.productoPedidoRepository.create({
        idPedido,
        idProducto,
        cantidad,
        precioUnitario,
        subtotal
      });
    }

    const productosDelPedido = await this.productoPedidoRepository.findByPedido(idPedido);

    const subtotalPedido = productosDelPedido.reduce(
      (sum, prod) => sum + Number(prod.subtotal),
      0
    );

    const nuevoTotal = Number(subtotalPedido.toFixed(2));

    await this.pedidoRepository.update(idPedido, {
      total: nuevoTotal
    });

    const pedidoActualizado = await this.pedidoRepository.findById(idPedido) as Pedido;

    return {
      pedido: pedidoActualizado,
      productoPedido,
      mensaje: "Producto agregado al pedido exitosamente"
    };
  }

  /**
   * Update quantity of an order line in a single operation.
   */
  async updateOrderProductQuantity(
    idPedido: number,
    idProductoPedido: number,
    cantidad: number,
    accessToken?: string
  ): Promise<{ pedido: Pedido; productoPedido: ProductoPedido; mensaje: string }> {
    if (cantidad <= 0) {
      throw new Error("La cantidad debe ser mayor a 0");
    }

    const productoPedido = await ProductoPedido.findByPk(idProductoPedido, {
      include: [{ model: Pedido }]
    });

    if (!productoPedido) {
      throw new Error("Producto no encontrado en el pedido");
    }

    if (productoPedido.idPedido !== idPedido) {
      throw new Error("La línea no pertenece al pedido indicado");
    }

    const pedido = productoPedido.pedido;

    if (pedido.estado === 'entregado' || pedido.estado === 'cancelado') {
      throw new Error("No se pueden modificar pedidos entregados o cancelados");
    }

    const producto = await this.inventoryService.getProductoById(productoPedido.idProducto, accessToken);
    if (!producto || !producto.activo) {
      throw new Error("El producto seleccionado no está disponible");
    }

    if (producto.stockActual < cantidad) {
      throw new Error(`Stock insuficiente para el producto ${productoPedido.idProducto}. Disponible: ${producto.stockActual}, solicitado: ${cantidad}`);
    }

    const calculoPromocion = await this.priceCalculatorService.calcularPrecioConPromocion(
      productoPedido.idProducto,
      cantidad,
      accessToken
    );

    const promoData = await this.promotionService?.checkProductoPromocionActiva(productoPedido.idProducto, accessToken) || { hasPromotion: false, promotion: null };
    let promocionAplicada = false;
    let idPromocion = null;
    let cantidadMinimaRequerida = null;

    if (promoData.hasPromotion && promoData.promotion) {
      cantidadMinimaRequerida = promoData.promotion.cantidad_minima;
      promocionAplicada = cantidad >= promoData.promotion.cantidad_minima;
      idPromocion = promocionAplicada ? promoData.promotion.id : null;
    }

    const precioUnitario = calculoPromocion.precioFinal;
    const subtotal = Number((precioUnitario * cantidad).toFixed(2));

    await this.productoPedidoRepository.update(productoPedido.idProductoPedido, {
      cantidad,
      precioUnitario,
      subtotal,
      promocionAplicada,
      idPromocion,
      cantidadMinimaRequerida
    });

    const productoPedidoActualizado = await this.productoPedidoRepository.findById(productoPedido.idProductoPedido) as ProductoPedido;

    const productosDelPedido = await this.productoPedidoRepository.findByPedido(idPedido);
    const subtotalPedido = Number(
      productosDelPedido.reduce((sum, prod) => sum + Number(prod.subtotal), 0).toFixed(2)
    );
    const nuevoTotal = subtotalPedido;

    await this.pedidoRepository.update(idPedido, { total: nuevoTotal });
    const pedidoActualizado = await this.pedidoRepository.findById(idPedido) as Pedido;

    return {
      pedido: pedidoActualizado,
      productoPedido: productoPedidoActualizado,
      mensaje: "Cantidad de producto actualizada exitosamente"
    };
  }

  /**
   * Update order status (CU38)
   */
  async updateOrderStatus(
    idPedido: number,
    nuevoEstado: string
  ): Promise<Pedido> {
    const pedido = await this.pedidoRepository.findById(idPedido);

    if (!pedido) {
      throw new Error("El pedido seleccionado no existe o fue eliminado");
    }

    const estadoActual = pedido.estado;

    const estadosValidos = ['sin_confirmar', 'pendiente', 'entregado', 'cancelado'];
    if (!estadosValidos.includes(nuevoEstado)) {
      throw new Error("Estado no válido");
    }

    if (estadoActual === 'entregado') {
      throw new Error("El pedido ya está en estado 'Entregado'. No se permiten modificaciones adicionales");
    }

    if (estadoActual === 'cancelado') {
      throw new Error("El pedido ya está cancelado. No se permiten modificaciones adicionales");
    }

    const transicionesValidas: { [key: string]: string[] } = {
      'sin_confirmar': ['pendiente', 'cancelado'],
      'pendiente': ['entregado', 'cancelado'],
      'entregado': [],
      'cancelado': []
    };

    if (!transicionesValidas[estadoActual]?.includes(nuevoEstado)) {
      throw new Error(
        `Transición de estado no permitida: no se puede cambiar de '${estadoActual}' a '${nuevoEstado}'`
      );
    }

    if (nuevoEstado === 'pendiente') {
      const pago = await this.pagoRepository.findOne({
        where: { idPedido }
      });

      if (!pago) {
        throw new Error("El pedido debe tener un pago registrado para poder marcarse como pendiente");
      }
    }

    await this.pedidoRepository.update(idPedido, {
      estado: nuevoEstado
    });

    const pedidoActualizado = await this.pedidoRepository.findById(idPedido) as Pedido;

    return pedidoActualizado;
  }

  /**
   * Cancel order
   */
  async cancelOrder(
    idPedido: number,
    idUsuario: number
  ): Promise<ServiceResult<{ mensaje: string }>> {
    try {
      const pedido = await this.pedidoRepository.findById(idPedido);

      if (!pedido) {
        return {
          status: 404,
          message: 'Pedido no encontrado'
        };
      }

      if (pedido.idUsuario !== idUsuario) {
        return {
          status: 403,
          message: 'No tienes permiso para cancelar este pedido'
        };
      }

      if (pedido.estado !== 'sin_confirmar' && pedido.estado !== 'pendiente') {
        return {
          status: 400,
          message: 'Solo se pueden cancelar pedidos sin confirmar o pendientes'
        };
      }

      await this.pedidoRepository.update(idPedido, {
        estado: 'cancelado'
      });

      return {
        status: 200,
        message: 'Pedido cancelado exitosamente',
        data: { mensaje: 'Pedido cancelado' }
      };
    } catch (error: any) {
      return {
        status: 500,
        message: `Error al cancelar pedido: ${error.message}`
      };
    }
  }

  /**
   * Remove product from order
   */
  async removeProductFromOrder(
    idProductoPedido: number
  ): Promise<ServiceResult<{ mensaje: string }>> {
    try {
      const productoPedido = await ProductoPedido.findByPk(idProductoPedido, {
        include: [{ model: Pedido }]
      });

      if (!productoPedido) {
        return {
          status: 404,
          message: 'Producto no encontrado en el pedido'
        };
      }

      const pedido = productoPedido.pedido;

      if (pedido.estado === 'entregado' || pedido.estado === 'cancelado') {
        return {
          status: 400,
          message: 'No se pueden modificar pedidos entregados o cancelados'
        };
      }

      await productoPedido.destroy();

      const productosRestantes = await this.productoPedidoRepository.findByPedido(pedido.idPedido);
      const subtotalPedido = Number(
        productosRestantes.reduce((sum, prod) => sum + Number(prod.subtotal), 0).toFixed(2)
      );
      const nuevoTotal = subtotalPedido;
      await this.pedidoRepository.update(pedido.idPedido, {
        total: nuevoTotal
      });

      return {
        status: 200,
        message: 'Producto eliminado del pedido',
        data: { mensaje: 'Producto eliminado exitosamente' }
      };
    } catch (error: any) {
      return {
        status: 500,
        message: `Error al eliminar producto: ${error.message}`
      };
    }
  }

  /**
   * Delete order
   */
  async deleteOrder(idPedido: number): Promise<ServiceResult<{ mensaje: string }>> {
    try {
      const pedido = await Pedido.findByPk(idPedido, {
        include: [{ model: Pago }]
      });

      if (!pedido) {
        return {
          status: 404,
          message: 'Pedido no encontrado'
        };
      }

      if (pedido.estado === 'entregado') {
        return {
          status: 400,
          message: 'No se pueden eliminar pedidos ya entregados'
        };
      }

      if (pedido.pagos && pedido.pagos.length > 0) {
        return {
          status: 400,
          message: 'No se puede eliminar un pedido que tiene pagos registrados. Cancélelo en su lugar.'
        };
      }

      await pedido.destroy();

      return {
        status: 200,
        message: 'Pedido eliminado exitosamente',
        data: { mensaje: 'Pedido eliminado' }
      };
    } catch (error: any) {
      return {
        status: 500,
        message: `Error al eliminar pedido: ${error.message}`
      };
    }
  }

  /**
   * Private: Validate product availability
   */
  private async validateProductAvailability(
    productosDelPedido: ProductoPedido[],
    accessToken?: string
  ): Promise<ServiceResult> {
    for (const productoPedido of productosDelPedido) {
      const producto = await this.inventoryService.getProductoById(
        productoPedido.idProducto,
        accessToken
      );

      if (!producto || !producto.activo) {
        return {
          status: 400,
          message: `El producto con ID ${productoPedido.idProducto} ya no está disponible`
        };
      }

      if (producto.stockActual < productoPedido.cantidad) {
        return {
          status: 400,
          message: `Stock insuficiente para el producto con ID ${productoPedido.idProducto}`
        };
      }
    }

    return { status: 200 };
  }

  /**
   * Private: Calculate total with promotions (centralized)
   */
  private async calculateTotalWithPromotions(
    productosDelPedido: ProductoPedido[],
    accessToken?: string
  ): Promise<number> {
    let totalFinal = 0;

    for (const productoPedido of productosDelPedido) {
      try {
        const calculoPromocion = await this.priceCalculatorService.calcularPrecioConPromocion(
          productoPedido.idProducto,
          productoPedido.cantidad,
          accessToken
        );

        const subtotalConPromocion = calculoPromocion.precioFinal * productoPedido.cantidad;
        totalFinal += subtotalConPromocion;

        await this.productoPedidoRepository.update(productoPedido.idProductoPedido, {
          precioUnitario: calculoPromocion.precioFinal,
          subtotal: subtotalConPromocion
        });
      } catch (error) {
        console.error(`Error al calcular promoción para producto ${productoPedido.idProducto}:`, error);
        totalFinal += Number(productoPedido.subtotal);
      }
    }

    return Number(totalFinal.toFixed(2));
  }

  async getProductsPromotionPricing(productIds: number[], accessToken?: string): Promise<Array<{
    idProducto: number;
    precioOriginal: number;
    precioPromocional: number | null;
    tienePromocion: boolean;
  }>> {
    const ids = Array.from(new Set((productIds || []).map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0)));

    const results = await Promise.all(ids.map(async (idProducto) => {
      try {
        const calculo = await this.priceCalculatorService.calcularPrecioConPromocion(idProducto, 1, accessToken);
        const precioOriginal = Number(calculo?.precioOriginal || 0);
        const precioFinal = Number(calculo?.precioFinal || precioOriginal || 0);
        const tienePromocion = Boolean(calculo?.tienePromocion && precioFinal < precioOriginal);

        return {
          idProducto,
          precioOriginal,
          precioPromocional: tienePromocion ? precioFinal : null,
          tienePromocion
        };
      } catch (error) {
        return {
          idProducto,
          precioOriginal: 0,
          precioPromocional: null,
          tienePromocion: false
        };
      }
    }));

    return results;
  }
}
