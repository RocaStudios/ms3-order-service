import { Request, Response, NextFunction } from "express";
import { cartService, orderService, orderQueryService, paymentService } from "../services/serviceInstances";
import { OrderValidator } from "../utils/orderValidator";
import { OrderMapper } from "../domain/mappers/orderMapper";
import { extractToken } from "../utils/tokenExtractor";
import { PaginationMetaDto } from "../domain/dtos/response/PaginatedResponseDto";
import { ApiResponse } from "../types";
import { AppError } from "../middlewares/error.middleware";

/**
 * OrderController - Handles HTTP requests for orders
 * Uses service instances, validators, and mappers for clean separation
 */
export class OrderController {

  private isBusinessValidationError(message?: string): boolean {
    if (!message) return false;

    const normalizedMessage = message.toLowerCase();
    return normalizedMessage.includes("stock")
      || normalizedMessage.includes("cantidad")
      || normalizedMessage.includes("no existe")
      || normalizedMessage.includes("no está disponible")
      || normalizedMessage.includes("no se pueden agregar productos");
  }

  /**
   * CU022 - Add product to cart
   * POST /api/orders/cart/product
   */
  addProductToCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { idProducto, cantidad } = req.body;
      const idUsuario = OrderValidator.validateAuthenticatedUser(req, res);
      if (!idUsuario) return;

      if (!OrderValidator.validateRequiredFields({ idProducto, cantidad }, ['idProducto', 'cantidad'], res)) {
        return;
      }

      if (!OrderValidator.validateIntegerFields({ idProducto, cantidad }, ['idProducto', 'cantidad'], res)) {
        return;
      }

      const accessToken = extractToken(req);
      const resultado = await cartService.addProductToCart(
        idUsuario,
        idProducto,
        cantidad,
        accessToken
      );

      const response: ApiResponse<any> = {
        success: resultado.status < 400,
        data: resultado.data || null,
        message: resultado.message || "Producto agregado al carrito",
        timestamp: new Date().toISOString()
      };

      res.status(resultado.status).json(response);
    } catch (error: any) {
      if (this.isBusinessValidationError(error?.message)) {
        next(new AppError(error.message, 400));
        return;
      }

      next(error);
    }
  };

  /**
   * Get current cart
   * GET /api/orders/cart
   */
  getCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idUsuario = OrderValidator.validateAuthenticatedUser(req, res);
      if (!idUsuario) return;

      const carrito = await cartService.getCurrentCart(idUsuario);

      if (!carrito) {
        const response: ApiResponse<null> = {
          success: true,
          message: "El carrito está vacío",
          data: null,
          timestamp: new Date().toISOString()
        };
        res.status(200).json(response);
        return;
      }

      const productos = await cartService.getCartProducts(idUsuario);

      const response: ApiResponse<any> = {
        success: true,
        data: {
          pedido: OrderMapper.toDto(carrito),
          productos: productos.map(p => OrderMapper.toProductDto(p))
        },
        message: "Carrito obtenido exitosamente",
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error: any) {
      if (this.isBusinessValidationError(error?.message)) {
        next(new AppError(error.message, 400));
        return;
      }

      next(error);
    }
  };

  /**
   * CU035 - Confirm order
   * POST /api/orders/confirm
   */
  confirmOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { direccionEntrega } = req.body;
      const idUsuario = OrderValidator.validateAuthenticatedUser(req, res);
      if (!idUsuario) return;

      const accessToken = extractToken(req);
      const resultado = await orderService.confirmOrder(
        idUsuario,
        { direccionEntrega },
        accessToken
      );

      const response: ApiResponse<any> = {
        success: resultado.status < 400,
        data: resultado.data || null,
        message: resultado.message || "Pedido confirmado exitosamente",
        timestamp: new Date().toISOString()
      };

      res.status(resultado.status).json(response);
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * CU37 - Add product to existing order
   * POST /api/orders/:idPedido/product
   */
  addProductToOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { idProducto, cantidad } = req.body;
      const idPedido = OrderValidator.validateIntegerId(req.params.idPedido, "ID de pedido", res);
      if (!idPedido) return;

      if (!OrderValidator.validateRequiredFields({ idProducto, cantidad }, ['idProducto', 'cantidad'], res)) {
        return;
      }

      if (!OrderValidator.validateIntegerFields({ idProducto, cantidad }, ['idProducto', 'cantidad'], res)) {
        return;
      }

      const accessToken = extractToken(req);
      const resultado = await orderService.addProductToOrder(
        idPedido,
        idProducto,
        cantidad,
        accessToken
      );

      const productos = await orderQueryService.getOrderProducts(idPedido);

      const response: ApiResponse<any> = {
        success: true,
        data: {
          pedido: {
            ...OrderMapper.toDto(resultado.pedido),
            cantidadProductos: productos.length
          },
          productoPedido: OrderMapper.toProductDto(resultado.productoPedido)
        },
        message: resultado.mensaje,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);

    } catch (error: any) {
      next(error);
    }
  };

  /**
   * Get order by ID
   * GET /api/orders/:idPedido
   */
  getOrderById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idPedido = OrderValidator.validateIntegerId(req.params.idPedido, "ID de pedido", res);
      if (!idPedido) return;

      const pedido = await orderQueryService.getOrderById(idPedido);

      if (!pedido) {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          message: "El pedido no existe",
          timestamp: new Date().toISOString()
        };
        res.status(404).json(response);
        return;
      }

      const productos = await orderQueryService.getOrderProducts(idPedido);

      const response: ApiResponse<any> = {
        success: true,
        data: {
          pedido: OrderMapper.toDto(pedido),
          productos: productos.map(p => OrderMapper.toProductDto(p))
        },
        message: "Pedido obtenido exitosamente",
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);

    } catch (error: any) {
      next(error);
    }
  };

  /**
   * Get latest open order by table.
   * GET /api/orders/mesa/:idMesa/open
   */
  getOpenOrderByMesa = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idMesa = OrderValidator.validateIntegerId(req.params.idMesa, "ID de mesa", res);
      if (!idMesa) return;

      const pedido = await orderQueryService.getOpenOrderByMesa(idMesa);

      if (!pedido) {
        const response: ApiResponse<null> = {
          success: true,
          data: null,
          message: "No hay pedido abierto para la mesa indicada",
          timestamp: new Date().toISOString()
        };
        res.status(200).json(response);
        return;
      }

      const productos = await orderQueryService.getOrderProducts(pedido.idPedido);

      const response: ApiResponse<any> = {
        success: true,
        data: {
          pedido: OrderMapper.toDto(pedido),
          productos: productos.map(p => OrderMapper.toProductDto(p))
        },
        message: "Pedido abierto obtenido exitosamente",
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * CU033 - List order history with pagination
   * GET /api/orders/history?page=1&limit=20
   */
  listOrderHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idUsuario = OrderValidator.validateAuthenticatedUser(req, res);
      if (!idUsuario) return;

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const filtros: any = {};

      if (req.query.fechaInicio && req.query.fechaFin) {
        filtros.fechaInicio = new Date(req.query.fechaInicio as string);
        filtros.fechaFin = new Date(req.query.fechaFin as string);

        if (!OrderValidator.validateDateRange(filtros.fechaInicio, filtros.fechaFin, res)) {
          return;
        }
      }

      if (req.query.estado) {
        const estadosValidos = ['pendiente', 'entregado', 'cancelado'];
        const estado = req.query.estado as string;
        
        if (!estadosValidos.includes(estado)) {
          const response: ApiResponse<null> = {
            success: false,
            data: null,
            message: `Estado inválido. Estados válidos: ${estadosValidos.join(', ')}`,
            timestamp: new Date().toISOString()
          };
          res.status(400).json(response);
          return;
        }
        
        filtros.estado = estado;
      }

      const { orders, total } = await orderQueryService.getOrderHistory(idUsuario, page, limit, filtros);

      if (orders.length === 0) {
        const response = {
          success: true,
          data: [],
          message: "No se encontraron pedidos anteriores",
          timestamp: new Date().toISOString(),
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0
          }
        };
        res.status(200).json(response);
        return;
      }

      const pedidosFormateados = await Promise.all(orders.map(async (pedido) => {
        const productos = await orderQueryService.getOrderProducts(pedido.idPedido);
        return {
          ...OrderMapper.toDto(pedido),
          cantidadProductos: productos.length
        };
      }));

      const pagination: PaginationMetaDto = {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      };

      const response = {
        success: true,
        data: pedidosFormateados,
        message: "Historial de pedidos obtenido exitosamente",
        timestamp: new Date().toISOString(),
        pagination
      };

      res.status(200).json(response);

    } catch (error: any) {
      next(error);
    }
  };

  /**
   * CU033 - Get customer order detail
   * GET /api/orders/:idPedido/detail
   */
  getCustomerOrderDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idUsuario = OrderValidator.validateAuthenticatedUser(req, res);
      if (!idUsuario) return;

      const idPedido = OrderValidator.validateIntegerId(req.params.idPedido, "ID de pedido", res);
      if (!idPedido) return;

      const pedido = await orderQueryService.getCustomerOrderDetail(idPedido, idUsuario);

      if (!pedido) {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          message: "Pedido no encontrado o no tiene acceso a este pedido",
          timestamp: new Date().toISOString()
        };
        res.status(404).json(response);
        return;
      }

      const productos = await orderQueryService.getOrderProducts(pedido.idPedido);

      const response: ApiResponse<any> = {
        success: true,
        data: {
          ...OrderMapper.toDto(pedido),
          productos: productos.map(p => OrderMapper.toProductDto(p))
        },
        message: "Detalle del pedido obtenido exitosamente",
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);

    } catch (error: any) {
      next(error);
    }
  };

  /**
   * CU034 - List orders in progress with pagination
   * GET /api/orders/in-progress?page=1&limit=20
   */
  listOrdersInProgress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idUsuario = OrderValidator.validateAuthenticatedUser(req, res);
      if (!idUsuario) return;

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const { orders, total } = await orderQueryService.getOrdersInProgress(idUsuario, page, limit);

      if (orders.length === 0) {
        const response = {
          success: true,
          data: [],
          message: "No tiene pedidos ni reservas en curso",
          timestamp: new Date().toISOString(),
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0
          }
        };
        res.status(200).json(response);
        return;
      }

      const pagination: PaginationMetaDto = {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      };

      const response = {
        success: true,
        data: OrderMapper.toDtoList(orders),
        message: "Pedidos en curso obtenidos exitosamente",
        timestamp: new Date().toISOString(),
        pagination
      };

      res.status(200).json(response);

    } catch (error: any) {
      next(error);
    }
  };

  /**
   * CU034 - Check order status
   * GET /api/orders/status/:idPedido
   */
  checkOrderStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idUsuario = OrderValidator.validateAuthenticatedUser(req, res);
      if (!idUsuario) return;

      const idPedido = OrderValidator.validateIntegerId(req.params.idPedido, "ID de pedido", res);
      if (!idPedido) return;

      const pedido = await orderQueryService.checkOrderStatus(idPedido, idUsuario);

      if (!pedido) {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          message: "Número no válido. Verifique e intente nuevamente",
          timestamp: new Date().toISOString()
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse<any> = {
        success: true,
        data: OrderMapper.toDto(pedido),
        message: "Estado del pedido obtenido exitosamente",
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);

    } catch (error: any) {
      next(error);
    }
  };

  /**
   * CU38 - Update order status
   * PATCH /api/orders/:idPedido/status
   */
  updateOrderStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { nuevoEstado } = req.body;
      const idPedido = OrderValidator.validateIntegerId(req.params.idPedido, "ID de pedido", res);
      if (!idPedido) return;

      if (!OrderValidator.validateRequiredFields({ nuevoEstado }, ['nuevoEstado'], res)) {
        return;
      }

      const pedidoActualizado = await orderService.updateOrderStatus(idPedido, nuevoEstado);

      const response: ApiResponse<any> = {
        success: true,
        data: {
          ...OrderMapper.toDto(pedidoActualizado),
          estadoActual: pedidoActualizado.estado
        },
        message: "Estado del pedido actualizado exitosamente",
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);

    } catch (error: any) {
      next(error);
    }
  };

  /**
   * Update quantity of a product line in an order.
   * PATCH /api/orders/:idPedido/product/:idProductoPedido
   */
  updateOrderProductQuantity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { cantidad } = req.body;
      const idPedido = OrderValidator.validateIntegerId(req.params.idPedido, "ID de pedido", res);
      if (!idPedido) return;

      const idProductoPedido = OrderValidator.validateIntegerId(req.params.idProductoPedido, "ID de producto del pedido", res);
      if (!idProductoPedido) return;

      if (!OrderValidator.validateRequiredFields({ cantidad }, ['cantidad'], res)) {
        return;
      }

      if (!OrderValidator.validateIntegerFields({ cantidad }, ['cantidad'], res)) {
        return;
      }

      if (!OrderValidator.validatePositiveNumber(cantidad, 'Cantidad', res)) {
        return;
      }

      const accessToken = extractToken(req);
      const resultado = await orderService.updateOrderProductQuantity(
        idPedido,
        idProductoPedido,
        cantidad,
        accessToken
      );

      const response: ApiResponse<any> = {
        success: true,
        data: {
          pedido: OrderMapper.toDto(resultado.pedido),
          productoPedido: OrderMapper.toProductDto(resultado.productoPedido)
        },
        message: resultado.mensaje,
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * CU038 - List all orders with pagination
   * GET /api/orders/all?page=1&limit=20
   */
  listAllOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const filtros: {
        busqueda?: string;
        estado?: string;
        fechaInicio?: Date;
        fechaFin?: Date;
      } = {};

      if (req.query.busqueda && String(req.query.busqueda).trim().length > 0) {
        filtros.busqueda = String(req.query.busqueda).trim();
      }

      if (req.query.estado) {
        const estado = String(req.query.estado);
        const estadosValidos = ['sin_confirmar', 'pendiente', 'entregado', 'cancelado'];
        if (!estadosValidos.includes(estado)) {
          const response: ApiResponse<null> = {
            success: false,
            data: null,
            message: `Estado inválido. Estados válidos: ${estadosValidos.join(', ')}`,
            timestamp: new Date().toISOString()
          };
          res.status(400).json(response);
          return;
        }
        filtros.estado = estado;
      }

      if (req.query.fechaInicio) {
        filtros.fechaInicio = new Date(String(req.query.fechaInicio));
      }

      if (req.query.fechaFin) {
        filtros.fechaFin = new Date(String(req.query.fechaFin));
      }

      if (filtros.fechaInicio && filtros.fechaFin && !OrderValidator.validateDateRange(filtros.fechaInicio, filtros.fechaFin, res)) {
        return;
      }

      const { orders, total } = await orderQueryService.listAllOrders(page, limit, filtros);

      const pagination: PaginationMetaDto = {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      };

      const response = {
        success: true,
        data: OrderMapper.toDtoList(orders),
        message: "Lista de pedidos obtenida exitosamente",
        timestamp: new Date().toISOString(),
        pagination
      };

      res.status(200).json(response);

    } catch (error: any) {
      next(error);
    }
  };

  getProductsPromotionPricing = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const productIds = req.body?.productIds;

      if (!Array.isArray(productIds)) {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          message: "El campo 'productIds' debe ser un arreglo de IDs",
          timestamp: new Date().toISOString()
        };
        res.status(400).json(response);
        return;
      }

      const idsNormalizados = Array.from(new Set(productIds
        .map((id: any) => Number(id))
        .filter((id: number) => Number.isInteger(id) && id > 0)));

      if (idsNormalizados.length === 0) {
        const response: ApiResponse<{ items: any[] }> = {
          success: true,
          data: { items: [] },
          message: 'No se recibieron IDs válidos',
          timestamp: new Date().toISOString()
        };
        res.status(200).json(response);
        return;
      }

      const accessToken = extractToken(req);
      const items = await orderService.getProductsPromotionPricing(idsNormalizados, accessToken);

      const response: ApiResponse<{ items: any[] }> = {
        success: true,
        data: { items },
        message: 'Precios promocionales obtenidos exitosamente',
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * CU48 - Create customer order (presencial)
   * POST /api/orders/create-customer-order
   */
  createCustomerOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { productos, idMesa } = req.body;
      const idUsuarioEmpleado = OrderValidator.validateAuthenticatedUser(req, res);
      if (!idUsuarioEmpleado) return;

      if (!productos || !Array.isArray(productos) || productos.length === 0) {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          message: "Debe proporcionar al menos un producto",
          timestamp: new Date().toISOString()
        };
        res.status(400).json(response);
        return;
      }

      for (const producto of productos) {
        if (!OrderValidator.validateRequiredFields(producto, ['idProducto', 'cantidad'], res)) {
          return;
        }

        if (!OrderValidator.validateIntegerFields(producto, ['idProducto', 'cantidad'], res)) {
          return;
        }

        if (!OrderValidator.validatePositiveNumber(producto.cantidad, "Cantidad", res)) {
          return;
        }
      }

      if (idMesa !== undefined && !Number.isInteger(idMesa)) {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          message: "El campo 'idMesa' debe ser un número entero",
          timestamp: new Date().toISOString()
        };
        res.status(400).json(response);
        return;
      }

      const accessToken = extractToken(req);
      const resultado = await orderService.createCustomerOrder(
        idUsuarioEmpleado,
        productos,
        idMesa,
        accessToken
      );

      const response: ApiResponse<any> = {
        success: true,
        data: {
          pedido: {
            ...OrderMapper.toDto(resultado.pedido),
            tipoPedido: resultado.pedido.idMesa ? 'Mesa' : 'Para llevar'
          },
          productos: resultado.productos.map(p => OrderMapper.toProductDto(p)),
          rutaPDF: resultado.rutaPDF
        },
        message: resultado.mensaje,
        timestamp: new Date().toISOString()
      };

      res.status(201).json(response);

    } catch (error: any) {
      next(error);
    }
  };

  /**
   * Update product quantity in cart
   * PATCH /api/orders/cart/product/:idProductoPedido
   */
  updateProductQuantity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { cantidad } = req.body;
      const idProductoPedido = OrderValidator.validateIntegerId(req.params.idProductoPedido, "ID de producto", res);
      if (!idProductoPedido) return;

      if (!OrderValidator.validateRequiredFields({ cantidad }, ['cantidad'], res)) {
        return;
      }

      if (!OrderValidator.validateIntegerFields({ cantidad }, ['cantidad'], res)) {
        return;
      }

      const idUsuario = req.user!.id;

      const resultado = await cartService.updateProductQuantity(idProductoPedido, cantidad, idUsuario);

      const response: ApiResponse<any> = {
        success: resultado.status < 400,
        data: resultado.data || null,
        message: resultado.message || "Cantidad actualizada exitosamente",
        timestamp: new Date().toISOString()
      };

      res.status(resultado.status).json(response);
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * Remove product from cart
   * DELETE /api/orders/cart/product/:idProductoPedido
   */
  removeProductFromCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idProductoPedido = OrderValidator.validateIntegerId(req.params.idProductoPedido, "ID de producto", res);
      if (!idProductoPedido) return;

      const idUsuario = req.user!.id;

      const resultado = await cartService.removeProductFromCart(idProductoPedido, idUsuario);

      const response: ApiResponse<any> = {
        success: resultado.status < 400,
        data: resultado.data || null,
        message: resultado.message || "Producto eliminado del carrito",
        timestamp: new Date().toISOString()
      };

      res.status(resultado.status).json(response);
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * Clear cart
   * DELETE /api/orders/cart
   */
  clearCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idUsuario = req.user!.id;

      const resultado = await cartService.clearCart(idUsuario);

      const response: ApiResponse<any> = {
        success: resultado.status < 400,
        data: resultado.data || null,
        message: resultado.message || "Carrito vaciado exitosamente",
        timestamp: new Date().toISOString()
      };

      res.status(resultado.status).json(response);
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * Cancel order
   * PATCH /api/orders/:idPedido/cancel
   */
  cancelOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idPedido = OrderValidator.validateIntegerId(req.params.idPedido, "ID de pedido", res);
      if (!idPedido) return;

      const idUsuario = req.user!.id;

      const resultado = await orderService.cancelOrder(idPedido, idUsuario);

      const response: ApiResponse<any> = {
        success: resultado.status < 400,
        data: resultado.data || null,
        message: resultado.message || "Pedido cancelado exitosamente",
        timestamp: new Date().toISOString()
      };

      res.status(resultado.status).json(response);
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * Remove product from order (employee/admin)
   * DELETE /api/orders/:idPedido/product/:idProductoPedido
   */
  removeProductFromOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idProductoPedido = OrderValidator.validateIntegerId(req.params.idProductoPedido, "ID de producto", res);
      if (!idProductoPedido) return;

      const resultado = await orderService.removeProductFromOrder(idProductoPedido);

      const response: ApiResponse<any> = {
        success: resultado.status < 400,
        data: resultado.data || null,
        message: resultado.message || "Producto eliminado del pedido",
        timestamp: new Date().toISOString()
      };

      res.status(resultado.status).json(response);
    } catch (error: any) {
      next(error);
    }
  };

  /**
   * Delete order (employee/admin)
   * DELETE /api/orders/:idPedido
   */
  deleteOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idPedido = OrderValidator.validateIntegerId(req.params.idPedido, "ID de pedido", res);
      if (!idPedido) return;

      const resultado = await orderService.deleteOrder(idPedido);

      const response: ApiResponse<any> = {
        success: resultado.status < 400,
        data: resultado.data || null,
        message: resultado.message || "Pedido eliminado exitosamente",
        timestamp: new Date().toISOString()
      };

      res.status(resultado.status).json(response);
    } catch (error: any) {
      next(error);
    }
  };

  downloadReceiptByOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idPedido = OrderValidator.validateIntegerId(req.params.idPedido, "ID de pedido", res);
      if (!idPedido) return;

      const idUsuario = OrderValidator.validateAuthenticatedUser(req, res);
      if (!idUsuario) return;

      const { pago, path } = await paymentService.getReceiptByOrderId(idPedido, idUsuario);

      const fs = require('fs');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=comprobante-pedido-${idPedido}.pdf`);
      
      const fileStream = fs.createReadStream(path);
      fileStream.pipe(res);
    } catch (error: any) {
      next(error);
    }
  };
}
