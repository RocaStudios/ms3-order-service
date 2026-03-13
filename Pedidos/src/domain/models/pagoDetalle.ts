import {
    Table,
    Column,
    Model,
    DataType,
    PrimaryKey,
    AutoIncrement,
    ForeignKey,
    BelongsTo
} from "sequelize-typescript";
import { Pago } from "./pago";
import { MetodoPago } from "./metodoPago";

@Table({ tableName: "pagoDetalle", timestamps: false })
export class PagoDetalle extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    idPagoDetalle!: number;

    @ForeignKey(() => Pago)
    @Column({
        type: DataType.INTEGER,
        allowNull: false
    })
    idPago!: number;

    @ForeignKey(() => MetodoPago)
    @Column({
        type: DataType.INTEGER,
        allowNull: false
    })
    idMetodoPago!: number;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: false
    })
    monto!: number;

    @BelongsTo(() => Pago)
    pago!: Pago;

    @BelongsTo(() => MetodoPago)
    metodoPago!: MetodoPago;
}
