import { Router } from "express";
import { OrderController } from "../controllers/OrderController";
import { authenticateToken, requireRoles, requireUsuarioActivo } from "../middlewares/authMiddleware";
import { TipoUsuario } from "../types/express";

const router = Router();
const orderController = new OrderController();

/** CU022 - Añadir productos al carrito (cliente) */
router.post(
	"/cart/product",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.cliente),
	orderController.addProductToCart
);

/** Eliminar todas las cantidades de un producto del carrito con idProductoPedido (cliente) */
router.delete(
	"/cart/product/:idProductoPedido",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.cliente),
	orderController.removeProductFromCart
);

/** Actualizar cantidad de un producto en el carrito (cliente) */
router.patch(
	"/cart/product/:idProductoPedido",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.cliente),
	orderController.updateProductQuantity
);

/** Vaciar el carrito completo (cliente) */
router.delete(
	"/cart",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.cliente),
	orderController.clearCart
);

/** Obtener carrito actual del cliente (cliente) */
router.get(
	"/cart",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.cliente),
	orderController.getCart
);

/** CU035 - Confirmar pedido del cliente (cliente) */
router.post(
	"/confirm",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.cliente),
	orderController.confirmOrder
);

/** CU48 - Crear pedido presencial o para llevar (empleado, administrador) */
router.post(
	"/create-customer-order",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.empleado, TipoUsuario.administrador),
	orderController.createCustomerOrder
);

/** CU37 - Añadir productos a un pedido (empleado, administrador) */
router.post(
	"/:idPedido/product",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.empleado, TipoUsuario.administrador),
	orderController.addProductToOrder
);

/** Eliminar un producto específico de un pedido (empleado, administrador) */
router.delete(
	"/:idPedido/product/:idProductoPedido",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.empleado, TipoUsuario.administrador),
	orderController.removeProductFromOrder
);

/** Eliminar un pedido completo (empleado, administrador) */
router.delete(
	"/:idPedido",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.empleado, TipoUsuario.administrador),
	orderController.deleteOrder
);

/** CU033 - Consultar historial de pedidos del cliente (cliente) */
router.get(
	"/history",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.cliente),
	orderController.listOrderHistory
);

/** CU034 - Listar pedidos en curso del cliente (cliente) */
router.get(
	"/in-progress",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.cliente),
	orderController.listOrdersInProgress
);

/** CU038 - Listar todos los pedidos del sistema (empleado, administrador) */
router.get(
	"/all",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.empleado, TipoUsuario.administrador),
	orderController.listAllOrders
);

/** Obtener pedido abierto por mesa (empleado, administrador) */
router.get(
	"/mesa/:idMesa/open",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.empleado, TipoUsuario.administrador),
	orderController.getOpenOrderByMesa
);

/** Obtener precios promocionales para un lote de productos (empleado, administrador) */
router.post(
	"/products/promotion-pricing",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.empleado, TipoUsuario.administrador),
	orderController.getProductsPromotionPricing
);

/** CU034 - Consultar estado de un pedido específico (cliente) */
router.get(
	"/status/:idPedido",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.cliente),
	orderController.checkOrderStatus
);

/** Descargar comprobante de pago por ID de pedido (cliente) */
router.get(
	"/:idPedido/receipt",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.cliente, TipoUsuario.empleado, TipoUsuario.administrador),
	orderController.downloadReceiptByOrder
);

/** CU033 - Consultar detalle completo de un pedido (cliente) */
router.get(
	"/:idPedido/detail",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.cliente),
	orderController.getCustomerOrderDetail
);

/** Obtener detalles de un pedido por ID (empleado, administrador) */
router.get(
	"/:idPedido",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.empleado, TipoUsuario.administrador),
	orderController.getOrderById
);

/** Actualizar cantidad de una línea del pedido (empleado, administrador) */
router.patch(
	"/:idPedido/product/:idProductoPedido",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.empleado, TipoUsuario.administrador),
	orderController.updateOrderProductQuantity
);

/** CU38 - Cambiar estado de un pedido (empleado, administrador) */
router.patch(
	"/:idPedido/status",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.empleado, TipoUsuario.administrador),
	orderController.updateOrderStatus
);

export default router;
