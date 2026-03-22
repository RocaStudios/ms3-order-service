import { Request, Response, NextFunction } from "express";
import { paymentService } from "../services/serviceInstances";
import { OrderValidator } from "../utils/orderValidator";
import { PaymentMapper } from "../domain/mappers/paymentMapper";
import { extractToken } from "../utils/tokenExtractor";
import { PaginationMetaDto } from "../domain/dtos/response/PaginatedResponseDto";
import { ApiResponse } from "../types";
import { TipoUsuario } from "../types/express";

/**
 * PaymentController - Handles HTTP requests for payments
 * Uses DI Container, Validators, and Mappers for clean separation
 */
export class PaymentController {
  /**
   * CU39 - List pending payment orders with pagination
   * GET /api/payments/pending-orders?page=1&limit=20
   */
  listPendingPaymentOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const idUsuario = req.user?.tipoUsuario === TipoUsuario.cliente ? req.user.id : undefined;

      const { pedidos, total } = await paymentService.listPendingPaymentOrders(page, limit, idUsuario);

      const pagination: PaginationMetaDto = {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      };

      const response = {
        success: true,
        message: "Lista de pedidos por pagar obtenida exitosamente",
        data: pedidos.map(p => ({
          idPedido: p.idPedido,
          idUsuario: p.idUsuario,
          total: p.total,
          estado: p.estado,
          canalVenta: p.canalVenta,
          tipoAtencion: p.tipoAtencion,
          fechaPedido: p.fechaPedido,
          direccionEntrega: p.direccionEntrega
        })),
        pagination,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);

    } catch (error: any) {
      next(error);
    }
  };

  /**
   * CU39/CU40 - Register payment for order
   * POST /api/payments/register/:idPedido
   */
  registerPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { idMetodoPago, metodos, direccionEntrega, montoRecibidoEfectivo } = req.body;
      const idPedido = OrderValidator.validateIntegerId(req.params.idPedido, "ID de pedido", res);
      if (!idPedido) return;

      const idUsuario = req.user!.id;

      const hasLegacy = idMetodoPago !== undefined && idMetodoPago !== null;
      const hasMixed = Array.isArray(metodos) && metodos.length > 0;

      if (!hasLegacy && !hasMixed) {
        res.status(400).json({
          success: false,
          message: "Debe proporcionar idMetodoPago (legacy) o metodos[] (mixto)"
        });
        return;
      }

      if (hasLegacy) {
        if (!OrderValidator.validateIntegerFields({ idMetodoPago }, ['idMetodoPago'], res)) {
          return;
        }
      }

      if (hasMixed) {
        for (const metodo of metodos) {
          if (!OrderValidator.validateRequiredFields(metodo, ['idMetodoPago', 'monto'], res)) {
            return;
          }

          if (!OrderValidator.validateIntegerFields(metodo, ['idMetodoPago'], res)) {
            return;
          }

          if (typeof metodo.monto !== 'number' || metodo.monto <= 0) {
            res.status(400).json({
              success: false,
              message: "Cada línea de metodos debe tener un monto mayor a 0"
            });
            return;
          }
        }
      }

      if (montoRecibidoEfectivo !== undefined) {
        if (typeof montoRecibidoEfectivo !== 'number' || montoRecibidoEfectivo <= 0) {
          res.status(400).json({
            success: false,
            message: "montoRecibidoEfectivo debe ser un número mayor a 0"
          });
          return;
        }
      }

      const accessToken = extractToken(req);
      const resultado = await paymentService.registerPayment(
        idPedido,
        idUsuario,
        {
          idMetodoPago,
          metodos,
          montoRecibidoEfectivo
        },
        direccionEntrega,
        accessToken
      );

      res.status(resultado.status).json(resultado.data || { success: false, message: resultado.message });
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * CU40 - List payment methods
   * GET /api/payments/methods
   */
  listPaymentMethods = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const metodos = await paymentService.listPaymentMethods();

      const response: ApiResponse<any> = {
        success: true,
        message: "Métodos de pago obtenidos exitosamente",
        data: metodos.map(m => ({
          idMetodoPago: m.idMetodo,
          nombre: m.nombre
        })),
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);

    } catch (error: any) {
      next(error);
    }
  };

  /**
   * Create payment method
   * POST /api/payments/methods
   */
  createPaymentMethod = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { nombre } = req.body;

      if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
        res.status(400).json({
          success: false,
          message: "El campo 'nombre' es requerido y debe ser un texto válido"
        });
        return;
      }

      const resultado = await paymentService.createPaymentMethod(nombre.trim());
      res.status(resultado.status).json(resultado.data || { success: false, message: resultado.message });
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * Get payment method by ID
   * GET /api/payments/methods/:idMetodo
   */
  getPaymentMethodById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idMetodo = OrderValidator.validateIntegerId(req.params.idMetodo, "ID de método de pago", res);
      if (!idMetodo) return;

      const metodo = await paymentService.getPaymentMethodById(idMetodo);

      if (!metodo) {
        res.status(404).json({
          success: false,
          message: "Método de pago no encontrado"
        });
        return;
      }

      const response = {
        success: true,
        message: "Método de pago obtenido exitosamente",
        data: {
          idMetodoPago: metodo.idMetodo,
          nombre: metodo.nombre
        },
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * Update payment method
   * PUT /api/payments/methods/:idMetodo
   */
  updatePaymentMethod = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { nombre } = req.body;
      const idMetodo = OrderValidator.validateIntegerId(req.params.idMetodo, "ID de método de pago", res);
      if (!idMetodo) return;

      if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
        res.status(400).json({
          success: false,
          message: "El campo 'nombre' es requerido y debe ser un texto válido"
        });
        return;
      }

      const resultado = await paymentService.updatePaymentMethod(idMetodo, nombre.trim());
      res.status(resultado.status).json(resultado.data || { success: false, message: resultado.message });
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * Delete payment method
   * DELETE /api/payments/methods/:idMetodo
   */
  deletePaymentMethod = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idMetodo = OrderValidator.validateIntegerId(req.params.idMetodo, "ID de método de pago", res);
      if (!idMetodo) return;

      const resultado = await paymentService.deletePaymentMethod(idMetodo);
      res.status(resultado.status).json(resultado.data || { success: false, message: resultado.message });
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * CU041 - Get payment history with filters and pagination
   * GET /api/payments/history?page=1&limit=20
   */
  getPaymentHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { fechaInicio, fechaFin, idMetodoPago, estado } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const filtros: any = {};

      if (fechaInicio) {
        filtros.fechaInicio = new Date(fechaInicio as string);
      }

      if (fechaFin) {
        filtros.fechaFin = new Date(fechaFin as string);
      }

      if (idMetodoPago) {
        filtros.idMetodoPago = parseInt(idMetodoPago as string);
      }

      if (estado) {
        filtros.estado = estado as string;
      }

      if (req.user?.tipoUsuario === TipoUsuario.cliente) {
        filtros.idUsuario = req.user.id;
      }

      const { pagos, total } = await paymentService.getPaymentHistory(page, limit, filtros);

      const pagination: PaginationMetaDto = {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      };

      const response = {
        success: true,
        message: "Historial de pagos obtenido exitosamente",
        data: PaymentMapper.toWithDetailsDtoList(pagos),
        pagination,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);

    } catch (error: any) {
      next(error);
    }
  };

  /**
   * Get all payments (admin only) with pagination
   * GET /api/payments/all?page=1&limit=20
   */
  getAllPayments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const { pagos, total } = await paymentService.getAllPayments(page, limit);

      const pagination: PaginationMetaDto = {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      };

      const response = {
        success: true,
        message: "Lista completa de pagos obtenida exitosamente",
        data: PaymentMapper.toWithDetailsDtoList(pagos),
        pagination,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);

    } catch (error: any) {
      next(error);
    }
  };

  /**
   * CU041 - Get payment detail
   * GET /api/payments/:idPago
   */
  getPaymentDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idPago = OrderValidator.validateIntegerId(req.params.idPago, "ID de pago", res);
      if (!idPago) return;

      const detalle = await paymentService.getPaymentDetail(idPago);

      const response = {
        success: true,
        message: "Detalle de pago obtenido exitosamente",
        data: PaymentMapper.toWithDetailsDto(detalle),
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);

    } catch (error: any) {
      next(error);
    }
  };

  /**
   * CU041 - Download payment receipt (PDF)
   * GET /api/payments/:idPago/receipt
   */
  downloadReceipt = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idPago = OrderValidator.validateIntegerId(req.params.idPago, "ID de pago", res);
      if (!idPago) return;

      const detalle = await paymentService.getPaymentDetail(idPago);

      if (!detalle.urlComprobante) {
        res.status(404).json({
          success: false,
          message: "El pago no tiene comprobante generado"
        });
        return;
      }

      const path = require('path');
      const fs = require('fs');
      
      const rutaArchivo = path.resolve(detalle.urlComprobante);

      if (!fs.existsSync(rutaArchivo)) {
        res.status(404).json({
          success: false,
          message: "Archivo de comprobante no encontrado"
        });
        return;
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=recibo_${idPago}.pdf`);
      
      const fileStream = fs.createReadStream(rutaArchivo);
      fileStream.pipe(res);

    } catch (error: any) {
      next(error);
    }
  };
}
