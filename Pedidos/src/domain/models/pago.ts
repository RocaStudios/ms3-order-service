import {
    Table,
    Column,
    Model,
    DataType,
    PrimaryKey,
    AutoIncrement,
    ForeignKey,
    BelongsTo,
    HasMany
} from "sequelize-typescript";
import { Pedido } from "./pedido";
import { MetodoPago } from "./metodoPago";
import { PagoDetalle } from "./pagoDetalle";

@Table({ tableName: "pago", timestamps: false })
export class Pago extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    idPago!: number;

    @Column({
        type: DataType.TEXT,
        allowNull: false
    })
    urlComprobante!: string;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: false
    })
    monto!: number;

    @Column({
        type: DataType.DATE,
        allowNull: false
    })
    fechaPago!: Date;

    @ForeignKey(() => Pedido)
    @Column(DataType.INTEGER)
    idPedido!: number;

    @ForeignKey(() => MetodoPago)
    @Column(DataType.INTEGER)
    idMetodoPago!: number;

    @BelongsTo(() => Pedido)
    pedido!: Pedido;

    @BelongsTo(() => MetodoPago)
    metodoPago!: MetodoPago;

    @HasMany(() => PagoDetalle)
    detalles!: PagoDetalle[];
}