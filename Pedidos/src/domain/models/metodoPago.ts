import {
    Table,
    Column,
    Model,
    DataType,
    PrimaryKey,
    AutoIncrement,
    HasMany
} from "sequelize-typescript";
import { PagoDetalle } from "./pagoDetalle";

@Table({ tableName: "metodoPago", timestamps: false })
export class MetodoPago extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    idMetodo!: number;

    @Column({
        type: DataType.STRING(50),
        allowNull: false
    })
    nombre!: string;

    @HasMany(() => PagoDetalle)
    detallesPago!: PagoDetalle[];
}