import { PedidoRepository } from "../../domain/repositories/pedidoRepository";
import { ProductoPedidoRepository } from "../../domain/repositories/productoPedidoRepository";
import { ListAllOrdersFilters } from "../../domain/repositories/pedidoRepository";
import { Pedido } from "../../domain/models/pedido";
import { ProductoPedido } from "../../domain/models/productoPedido";
import { ServiceResult } from "../../types/pedido.types";
import { Op } from "sequelize";

/**
 * OrderQueryService - Handles order queries and history
 * Responsibility: Read operations for orders
 */
export class OrderQueryService {
  constructor(
    private pedidoRepository: PedidoRepository,
    private productoPedidoRepository: ProductoPedidoRepository
  ) {}

  /**
   * Get order by ID
   */
  async getOrderById(idPedido: number): Promise<Pedido | null> {
    return await this.pedidoRepository.findById(idPedido);
  }

  /**
   * Get products of a specific order
   */
  async getOrderProducts(idPedido: number): Promise<ProductoPedido[]> {
    return await this.productoPedidoRepository.findByPedido(idPedido);
  }

  /**
   * Get latest open order for a table.
   */
  async getOpenOrderByMesa(idMesa: number): Promise<Pedido | null> {
    return await this.pedidoRepository.findLatestOpenByMesa(idMesa);
  }

  /**
   * Get order history with filters (CU033)
   */
  async getOrderHistory(
    idUsuario: number,
    page: number = 1,
    limit: number = 20,
    filtros?: {
      fechaInicio?: Date;
      fechaFin?: Date;
      estado?: string;
      idMetodoPago?: number;
    }
  ): Promise<{ orders: Pedido[]; total: number }> {
    const whereConditions: any = { 
      idUsuario,
      estado: { [Op.ne]: 'sin_confirmar' }
    };

    if (filtros?.fechaInicio && filtros?.fechaFin) {
      whereConditions.fechaPedido = {
        [Op.gte]: filtros.fechaInicio,
        [Op.lte]: filtros.fechaFin
      };
    }

    if (filtros?.estado) {
      whereConditions.estado = filtros.estado;
    }

    const offset = (page - 1) * limit;

    const { rows: orders, count: total } = await this.pedidoRepository.findAndCountAll({
      where: whereConditions,
      order: [['fechaPedido', 'DESC']],
      limit,
      offset
    });

    return { orders, total };
  }

  /**
   * Get customer order detail (CU033)
   */
  async getCustomerOrderDetail(
    idPedido: number,
    idUsuario: number
  ): Promise<Pedido | null> {
    const pedido = await this.pedidoRepository.findOne({
      where: {
        idPedido,
        idUsuario
      }
    });

    return pedido;
  }

  /**
   * Get orders in progress (CU034)
   */
  async getOrdersInProgress(
    idUsuario: number,
    page: number = 1,
    limit: number = 20
  ): Promise<{ orders: Pedido[]; total: number }> {
    const offset = (page - 1) * limit;

    const { rows: orders, count: total } = await this.pedidoRepository.findAndCountAll({
      where: {
        idUsuario,
        estado: 'pendiente'
      },
      order: [['fechaPedido', 'DESC']],
      limit,
      offset
    });

    return { orders, total };
  }

  /**
   * Check order status (CU034)
   */
  async checkOrderStatus(
    idPedido: number,
    idUsuario: number
  ): Promise<Pedido | null> {
    const pedido = await this.pedidoRepository.findOne({
      where: {
        idPedido,
        idUsuario
      }
    });

    return pedido;
  }

  /**
   * List all orders (for employees/admins - CU038)
   */
  async listAllOrders(
    page: number = 1,
    limit: number = 20,
    filtros?: ListAllOrdersFilters
  ): Promise<{ orders: Pedido[]; total: number }> {
    const { rows: orders, count: total } = await this.pedidoRepository.findAndCountAllFiltered(
      page,
      limit,
      filtros
    );

    return { orders, total };
  }
}
