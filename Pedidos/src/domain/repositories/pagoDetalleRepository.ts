import { BaseRepository } from "./baseRepository";
import { PagoDetalle, MetodoPago } from "../models";

export class PagoDetalleRepository extends BaseRepository<PagoDetalle> {
  constructor() {
    super(PagoDetalle);
  }

  async findByPago(idPago: number): Promise<PagoDetalle[]> {
    return this.model.findAll({
      where: { idPago },
      include: [{ model: MetodoPago, as: 'metodoPago' }]
    });
  }

  async existsByMetodoPago(idMetodoPago: number): Promise<boolean> {
    const total = await this.model.count({ where: { idMetodoPago } });
    return total > 0;
  }
}
