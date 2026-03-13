import { Pedido } from "../models/pedido";
import { ProductoPedido } from "../models/productoPedido";
import { OrderResponseDto, OrderProductResponseDto, OrderWithProductsResponseDto } from "../dtos/response/OrderResponseDto";

export class OrderMapper {
  static toDto(order: Pedido): OrderResponseDto {
    return {
      idPedido: order.idPedido,
      idUsuario: order.idUsuario,
      total: order.total,
      estado: order.estado,
      canalVenta: order.canalVenta,
      tipoAtencion: order.tipoAtencion as 'local' | 'llevar' | undefined,
      fechaPedido: order.fechaPedido,
      direccionEntrega: order.direccionEntrega,
      idMesa: order.idMesa
    };
  }

  static toProductDto(orderProduct: ProductoPedido): OrderProductResponseDto {
    return {
      idProductoPedido: orderProduct.idProductoPedido,
      idProducto: orderProduct.idProducto,
      cantidad: orderProduct.cantidad,
      precioUnitario: orderProduct.precioUnitario,
      subtotal: orderProduct.subtotal
    };
  }

  static toWithProductsDto(order: Pedido, products: ProductoPedido[]): OrderWithProductsResponseDto {
    return {
      ...this.toDto(order),
      productos: products.map(p => this.toProductDto(p)),
      cantidadProductos: products.length
    };
  }

  static toDtoList(orders: Pedido[]): OrderResponseDto[] {
    return orders.map(order => this.toDto(order));
  }
}
