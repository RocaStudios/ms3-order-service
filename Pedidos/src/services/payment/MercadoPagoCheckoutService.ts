import { MercadoPagoConfig, Preference } from "mercadopago";
import { PedidoRepository } from "../../domain/repositories/pedidoRepository";

type CreatePreferenceResult =
  | {
      ok: true;
      data: {
        preferenceId: string;
        initPoint?: string;
        sandboxInitPoint?: string;
      };
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

export class MercadoPagoCheckoutService {
  constructor(private readonly pedidoRepository: PedidoRepository) {}

  async createPreferenceForClient(idPedido: number, idUsuario: number): Promise<CreatePreferenceResult> {
    const accessToken = process.env.MP_ACCESS_TOKEN;

    if (!accessToken) {
      return {
        ok: false,
        status: 500,
        message: "No se configuró MP_ACCESS_TOKEN en el microservicio de pedidos"
      };
    }

    const pedido = await this.pedidoRepository.findById(idPedido);

    if (!pedido) {
      return {
        ok: false,
        status: 404,
        message: "Pedido no encontrado"
      };
    }

    if (pedido.idUsuario !== idUsuario) {
      return {
        ok: false,
        status: 403,
        message: "No tienes permisos para pagar este pedido"
      };
    }

    const total = Number(pedido.total || 0);
    if (Number.isNaN(total) || total <= 0) {
      return {
        ok: false,
        status: 400,
        message: "El pedido no tiene un monto válido para generar checkout"
      };
    }

    const unitPrice = Math.max(1, Math.round(total));

    const mpClient = new MercadoPagoConfig({ accessToken });
    const preferenceClient = new Preference(mpClient);

    try {
      const preference = await preferenceClient.create({
        body: {
          items: [
            {
              id: `pedido-${pedido.idPedido}`,
              title: `Pedido #${pedido.idPedido} - Don Papa`,
              quantity: 1,
              currency_id: "COP",
              unit_price: unitPrice
            }
          ],
          external_reference: `pedido:${pedido.idPedido};usuario:${idUsuario}`
        }
      });

      if (!preference.id) {
        return {
          ok: false,
          status: 502,
          message: "MercadoPago no devolvió un preferenceId válido"
        };
      }

      return {
        ok: true,
        data: {
          preferenceId: preference.id,
          initPoint: preference.init_point,
          sandboxInitPoint: preference.sandbox_init_point
        }
      };
    } catch (error: any) {
      console.error("Error creando preferencia de MercadoPago:", error);
      return {
        ok: false,
        status: 502,
        message: "No se pudo crear la preferencia de MercadoPago"
      };
    }
  }
}