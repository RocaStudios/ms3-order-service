import { Pago } from "../models/pago";
import { PaymentResponseDto, PaymentWithDetailsResponseDto } from "../dtos/response/PaymentResponseDto";

export class PaymentMapper {
  static toDto(payment: Pago): PaymentResponseDto {
    return {
      idPago: payment.idPago,
      urlComprobante: payment.urlComprobante,
      monto: payment.monto,
      fechaPago: payment.fechaPago,
      idPedido: payment.idPedido,
      idMetodoPago: payment.idMetodoPago,
      detalles: (payment.detalles || []).map(detalle => ({
        idMetodoPago: detalle.idMetodoPago,
        nombre: detalle.metodoPago?.nombre,
        monto: Number(detalle.monto)
      }))
    };
  }

  static toWithDetailsDto(payment: Pago): PaymentWithDetailsResponseDto {
    return {
      ...this.toDto(payment),
      metodoPago: payment.metodoPago ? {
        idMetodoPago: payment.metodoPago.idMetodo,
        nombre: payment.metodoPago.nombre
      } : undefined,
      pedido: payment.pedido ? {
        idPedido: payment.pedido.idPedido,
        idUsuario: payment.pedido.idUsuario,
        total: payment.pedido.total,
        estado: payment.pedido.estado,
        fechaPedido: payment.pedido.fechaPedido,
        direccionEntrega: payment.pedido.direccionEntrega,
        canalVenta: payment.pedido.canalVenta,
        tipoAtencion: payment.pedido.tipoAtencion as 'local' | 'llevar' | undefined,
        idMesa: payment.pedido.idMesa
      } : undefined
    };
  }

  static toHistoryDto(payment: Pago): PaymentWithDetailsResponseDto {
    return {
      ...this.toDto(payment),
      metodoPago: payment.metodoPago ? {
        idMetodoPago: payment.metodoPago.idMetodo,
        nombre: payment.metodoPago.nombre
      } : undefined,
      pedido: payment.pedido ? {
        idPedido: payment.pedido.idPedido,
        total: payment.pedido.total,
        estado: payment.pedido.estado,
        fechaPedido: payment.pedido.fechaPedido,
        direccionEntrega: payment.pedido.direccionEntrega,
        idUsuario: payment.pedido.idUsuario,
        canalVenta: payment.pedido.canalVenta,
        tipoAtencion: payment.pedido.tipoAtencion as 'local' | 'llevar' | undefined
      } : undefined
    };
  }

  static toDtoList(payments: Pago[]): PaymentResponseDto[] {
    return payments.map(payment => this.toDto(payment));
  }

  static toWithDetailsDtoList(payments: Pago[]): PaymentWithDetailsResponseDto[] {
    return payments.map(payment => this.toWithDetailsDto(payment));
  }
}
