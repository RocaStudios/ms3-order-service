import { BaseRepository } from "./baseRepository";
import { Pedido } from "../models";
import { FindOptions, Op, WhereOptions } from "sequelize";

export interface ListAllOrdersFilters {
    busqueda?: string;
    estado?: string;
    fechaInicio?: Date;
    fechaFin?: Date;
}

export class PedidoRepository extends BaseRepository<Pedido> {
    constructor() {
        super(Pedido);
    }

    async findByUsuario(idUsuario: number): Promise<Pedido[]> {
        return this.model.findAll({ where: { idUsuario } });
    }

    async findByEstado(estado: string): Promise<Pedido[]> {
        return this.model.findAll({ where: { estado } });
    }

    async findLatestOpenByMesa(idMesa: number): Promise<Pedido | null> {
        return this.model.findOne({
            where: {
                idMesa,
                estado: {
                    [Op.in]: ['sin_confirmar', 'pendiente']
                }
            },
            order: [['fechaPedido', 'DESC']]
        });
    }

    async findAndCountAllFiltered(
        page: number,
        limit: number,
        filters?: ListAllOrdersFilters
    ): Promise<{ rows: Pedido[]; count: number }> {
        const offset = (page - 1) * limit;
        const where: WhereOptions = {};

        if (filters?.estado) {
            Object.assign(where, { estado: filters.estado });
        }

        if (filters?.fechaInicio || filters?.fechaFin) {
            if (filters.fechaInicio && filters.fechaFin) {
                Object.assign(where, {
                    fechaPedido: {
                        [Op.between]: [filters.fechaInicio, filters.fechaFin]
                    }
                });
            } else if (filters.fechaInicio) {
                Object.assign(where, {
                    fechaPedido: {
                        [Op.gte]: filters.fechaInicio
                    }
                });
            } else if (filters.fechaFin) {
                Object.assign(where, {
                    fechaPedido: {
                        [Op.lte]: filters.fechaFin
                    }
                });
            }
        }

        const busqueda = filters?.busqueda?.trim();
        if (busqueda) {
            const numericSearch = Number.parseInt(busqueda, 10);
            const orConditions: WhereOptions[] = [
                {
                    direccionEntrega: {
                        [Op.like]: `%${busqueda}%`
                    }
                }
            ];

            if (!Number.isNaN(numericSearch)) {
                orConditions.push({ idPedido: numericSearch });
                orConditions.push({ idUsuario: numericSearch });
            }

            Object.assign(where, {
                [Op.or]: orConditions
            });
        }

        const options: FindOptions = {
            where,
            order: [['fechaPedido', 'DESC']],
            limit,
            offset
        };

        return this.model.findAndCountAll(options);
    }
}
