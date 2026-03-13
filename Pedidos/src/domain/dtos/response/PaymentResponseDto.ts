export interface PaymentResponseDto {
  idPago: number;
  urlComprobante: string;
  monto: number;
  fechaPago: Date;
  idPedido: number;
  idMetodoPago: number;
  detalles?: PaymentMethodSplitDto[];
}

export interface PaymentMethodSplitDto {
  idMetodoPago: number;
  nombre?: string;
  monto: number;
}

export interface PaymentWithDetailsResponseDto extends PaymentResponseDto {
  metodoPago?: {
    idMetodoPago: number;
    nombre: string;
  };
  pedido?: {
    idPedido: number;
    idUsuario: number;
    total: number;
    estado: string;
    fechaPedido: Date;
    direccionEntrega?: string;
    canalVenta: string;
    tipoAtencion?: 'local' | 'llevar';
    idMesa?: number;
  };
}

export interface PaymentMethodResponseDto {
  idMetodo: number;
  nombre: string;
}
