/**
 * Instancias globales de servicios
 * Reemplaza el patrón de Inyección de Dependencias por simplicidad
 */

import { PedidoRepository } from "../domain/repositories/pedidoRepository";
import { ProductoPedidoRepository } from "../domain/repositories/productoPedidoRepository";
import { PagoRepository } from "../domain/repositories/pagoRepository";
import { PagoDetalleRepository } from "../domain/repositories/pagoDetalleRepository";
import { MetodoPagoRepository } from "../domain/repositories/metodoPagoRepository";
import { InventoryService } from "./apis/inventoryService";
import { ClientService } from "./apis/clientService";
import { TableService } from "./apis/tableService";
import { PromotionService } from "./apis/promotionService";
import { PriceCalculatorService } from "./priceCalculatorService";
import { CartService } from "./cart/CartService";
import { OrderService } from "./order/OrderService";
import { OrderQueryService } from "./order/OrderQueryService";
import { PaymentService } from "./payment/PaymentService";

// Repositorios
const pedidoRepository = new PedidoRepository();
const productoPedidoRepository = new ProductoPedidoRepository();
const pagoRepository = new PagoRepository();
const pagoDetalleRepository = new PagoDetalleRepository();
const metodoPagoRepository = new MetodoPagoRepository();

// Servicios de APIs externas
const inventoryService = new InventoryService();
const clientService = new ClientService();
const tableService = new TableService();
const promotionService = new PromotionService();

// Servicios de negocio
const priceCalculatorService = new PriceCalculatorService();

// Servicios de Carrito
export const cartService = new CartService(
  pedidoRepository,
  productoPedidoRepository,
  inventoryService
);

// Servicios de Pedido
export const orderService = new OrderService(
  pedidoRepository,
  productoPedidoRepository,
  pagoRepository,
  inventoryService,
  clientService,
  tableService,
  priceCalculatorService,
  promotionService
);

export const orderQueryService = new OrderQueryService(
  pedidoRepository,
  productoPedidoRepository
);

// Servicios de Pago
export const paymentService = new PaymentService(
  pedidoRepository,
  productoPedidoRepository,
  pagoRepository,
  pagoDetalleRepository,
  metodoPagoRepository,
  tableService,
  inventoryService,
  clientService,
  priceCalculatorService
);
