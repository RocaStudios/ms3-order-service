import { Router } from "express";
import { PaymentController } from "../controllers/PaymentController";
import { authenticateToken, requireRoles, requireUsuarioActivo } from "../middlewares/authMiddleware";
import { TipoUsuario } from "../types/express";

const router = Router();
const paymentController = new PaymentController();

/** CU39 - Listar pedidos pendientes de pago */
router.get(
  "/pending-orders",
  authenticateToken,
  requireUsuarioActivo,
  requireRoles(TipoUsuario.cliente, TipoUsuario.empleado, TipoUsuario.administrador),
  paymentController.listPendingPaymentOrders
);

/** CU40 - Listar métodos de pago disponibles */
router.get(
  "/methods",
  authenticateToken,
  requireUsuarioActivo,
  requireRoles(TipoUsuario.cliente, TipoUsuario.empleado, TipoUsuario.administrador),
  paymentController.listPaymentMethods
);

/** Crear método de pago */
router.post(
  "/methods",
  authenticateToken,
  requireUsuarioActivo,
  requireRoles(TipoUsuario.administrador),
  paymentController.createPaymentMethod
);

/** CU041 - Consultar historial de pagos con filtros opcionales */
router.get(
  "/history",
  authenticateToken,
  requireUsuarioActivo,
  requireRoles(TipoUsuario.cliente, TipoUsuario.empleado, TipoUsuario.administrador),
  paymentController.getPaymentHistory
);

/** Obtener todos los pagos del sistema (Solo administradores) */
router.get(
  "/all",
  authenticateToken,
  requireUsuarioActivo,
  requireRoles(TipoUsuario.administrador),
  paymentController.getAllPayments
);

/** Obtener método de pago por ID */
router.get(
  "/methods/:idMetodo",
  authenticateToken,
  requireUsuarioActivo,
  requireRoles(TipoUsuario.empleado, TipoUsuario.administrador),
  paymentController.getPaymentMethodById
);

/** Actualizar método de pago */
router.put(
  "/methods/:idMetodo",
  authenticateToken,
  requireUsuarioActivo,
  requireRoles(TipoUsuario.administrador),
  paymentController.updatePaymentMethod
);

/** Eliminar método de pago */
router.delete(
  "/methods/:idMetodo",
  authenticateToken,
  requireUsuarioActivo,
  requireRoles(TipoUsuario.administrador),
  paymentController.deletePaymentMethod
);

/** CU39/CU40 - Registrar pago de pedido y generar recibo PDF */
router.post(
  "/register/:idPedido",
  authenticateToken,
  requireUsuarioActivo,
  requireRoles(TipoUsuario.cliente, TipoUsuario.empleado, TipoUsuario.administrador),
  paymentController.registerPayment
);

/** CU041 - Obtener información detallada de un pago */
router.get(
  "/:idPago",
  authenticateToken,
  requireUsuarioActivo,
  requireRoles(TipoUsuario.empleado, TipoUsuario.administrador),
  paymentController.getPaymentDetail
);

/** CU041 - Descargar comprobante de pago en PDF */
router.get(
  "/:idPago/receipt",
  authenticateToken,
  requireUsuarioActivo,
  requireRoles(TipoUsuario.cliente, TipoUsuario.empleado, TipoUsuario.administrador),
  paymentController.downloadReceipt
);

export default router;