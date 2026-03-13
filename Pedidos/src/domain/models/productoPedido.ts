import {
    Table,
    Column,
    Model,
    DataType,
    PrimaryKey,
    AutoIncrement,
    ForeignKey,
    BelongsTo,
    AllowNull
} from "sequelize-typescript";
import { Pedido } from "./pedido";

@Table({ tableName: "productoPedido", timestamps: false })
export class ProductoPedido extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    idProductoPedido!: number;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: false
    })
    subtotal!: number;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: false
    })
    precioUnitario!: number;

    @Column({
        type: DataType.INTEGER,
        allowNull: false
    })
    cantidad!: number;

    @Column({
        type: DataType.INTEGER,
        allowNull: false
    })
    idProducto!: number;

    @Column({
        type: DataType.BOOLEAN,
        allowNull: true,
        defaultValue: false
    })
    promocionAplicada!: boolean;

    @Column({
        type: DataType.INTEGER,
        allowNull: true
    })
    idPromocion!: number | null;

    @Column({
        type: DataType.INTEGER,
        allowNull: true
    })
    cantidadMinimaRequerida!: number | null;

    @ForeignKey(() => Pedido)
    @Column(DataType.INTEGER)
    idPedido!: number;

    @BelongsTo(() => Pedido)
    pedido!: Pedido;
}