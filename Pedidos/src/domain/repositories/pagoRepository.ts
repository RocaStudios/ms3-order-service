import { BaseRepository } from "./baseRepository";
import { Pago, Pedido, MetodoPago, PagoDetalle } from "../models";

export class PagoRepository extends BaseRepository<Pago> {
    constructor() {
        super(Pago);
    }

    async findByPedido(idPedido: number): Promise<Pago[]> {
        return this.model.findAll({ where: { idPedido } });
    }

    async findAllWithRelations(whereClausePago: any, whereClausePedido: any): Promise<Pago[]> {
        return this.model.findAll({
            where: whereClausePago,
            include: [
                {
                    model: Pedido,
                    as: 'pedido',
                    where: Object.keys(whereClausePedido).length > 0 ? whereClausePedido : undefined
                },
                {
                    model: MetodoPago,
                    as: 'metodoPago'
                },
                {
                    model: PagoDetalle,
                    as: 'detalles',
                    include: [{
                        model: MetodoPago,
                        as: 'metodoPago'
                    }]
                }
            ],
            order: [['fechaPago', 'DESC']]
        });
    }

    async findByIdWithRelations(idPago: number): Promise<Pago | null> {
        return this.model.findOne({
            where: { idPago },
            include: [
                {
                    model: Pedido,
                    as: 'pedido'
                },
                {
                    model: MetodoPago,
                    as: 'metodoPago'
                },
                {
                    model: PagoDetalle,
                    as: 'detalles',
                    include: [{
                        model: MetodoPago,
                        as: 'metodoPago'
                    }]
                }
            ]
        });
    }
}
