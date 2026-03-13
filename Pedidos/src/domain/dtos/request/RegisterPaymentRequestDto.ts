export interface RegisterPaymentRequestDto {
  idMetodoPago?: number;
  metodos?: Array<{
    idMetodoPago: number;
    monto: number;
  }>;
  montoRecibidoEfectivo?: number;
  direccionEntrega?: string;
}
