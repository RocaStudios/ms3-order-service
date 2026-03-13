import {
    Table,
    Column,
    Model,
    DataType,
    PrimaryKey,
    AutoIncrement,
    ForeignKey,
    BelongsTo,
    HasMany,
    AllowNull
} from "sequelize-typescript";
import { ProductoPedido } from "./productoPedido";
import { Pago } from "./pago";

@Table({ tableName: "pedido", timestamps: false })
export class Pedido extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    idPedido!: number;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: false
    })
    total!: number;

    @Column({
        type: DataType.ENUM('web', 'fisico'),
        allowNull: false
    })
    canalVenta!: string;

    @AllowNull(true)
    @Column({
        type: DataType.ENUM('local', 'llevar'),
        allowNull: true
    })
    tipoAtencion?: string;

    @Column({
        type: DataType.ENUM('sin_confirmar', 'pendiente', 'entregado', 'cancelado'),
        allowNull: false
    })
    estado!: string;

    @Column({
        type: DataType.DATE,
        allowNull: false
    })
    fechaPedido!: Date;

    @Column({
        type: DataType.STRING(200),
        allowNull: true
    })
    direccionEntrega?: string;

    @Column({
        type: DataType.INTEGER,
        allowNull: true
    })
    idMesa?: number;

    @Column({
        type: DataType.INTEGER,
        allowNull: false
    })
    idUsuario!: number;

    // Relaciones
    @HasMany(() => ProductoPedido)
    productos!: ProductoPedido[];

    @HasMany(() => Pago)
    pagos!: Pago[];
}