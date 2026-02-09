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
	"/cart/product/:idProductoPedido(\\d+)",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.cliente),
	orderController.removeProductFromCart
);

/** Actualizar cantidad de un producto en el carrito (cliente) */
router.patch(
	"/cart/product/:idProductoPedido(\\d+)",
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
	"/:idPedido(\\d+)/product",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.empleado, TipoUsuario.administrador),
	orderController.addProductToOrder
);

/** Eliminar un producto específico de un pedido (empleado, administrador) */
router.delete(
	"/:idPedido(\\d+)/product/:idProductoPedido(\\d+)",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.empleado, TipoUsuario.administrador),
	orderController.removeProductFromOrder
);

/** Eliminar un pedido completo (empleado, administrador) */
router.delete(
	"/:idPedido(\\d+)",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.empleado, TipoUsuario.administrador),
	orderController.deleteOrder
);

/** Obtener detalles de un pedido por ID (empleado, administrador) */
router.get(
	"/:idPedido(\\d+)",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.empleado, TipoUsuario.administrador),
	orderController.getOrderById
);

/** CU033 - Consultar historial de pedidos del cliente (cliente) */
router.get(
	"/history",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.cliente),
	orderController.listOrderHistory
);

/** CU033 - Consultar detalle completo de un pedido (cliente) */
router.get(
	"/:idPedido(\\d+)/detail",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.cliente),
	orderController.getCustomerOrderDetail
);

/** CU034 - Listar pedidos en curso del cliente (cliente) */
router.get(
	"/in-progress",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.cliente),
	orderController.listOrdersInProgress
);

/** CU034 - Consultar estado de un pedido específico (cliente) */
router.get(
	"/status/:idPedido(\\d+)",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.cliente),
	orderController.checkOrderStatus
);

/** CU038 - Listar todos los pedidos del sistema (empleado, administrador) */
router.get(
	"/all",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.empleado, TipoUsuario.administrador),
	orderController.listAllOrders
);

/** CU38 - Cambiar estado de un pedido (empleado, administrador) */
router.patch(
	"/:idPedido(\\d+)/status",
	authenticateToken,
	requireUsuarioActivo,
	requireRoles(TipoUsuario.empleado, TipoUsuario.administrador),
	orderController.updateOrderStatus
);

export default router;
