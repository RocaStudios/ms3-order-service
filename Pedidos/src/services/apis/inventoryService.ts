import axios, { AxiosInstance } from 'axios';
import { Request, Response } from 'express';
/**
 * Servicio para consumir la API de Inventario
 * Realiza llamadas HTTP al microservicio de inventario para obtener y gestionar productos
 */

export class InventoryService {
  private axiosInstance: AxiosInstance;
  private inventoryBaseUrl: string;
  private internalToken?: string;

  constructor() {
    this.inventoryBaseUrl = process.env.INVENTORY_SERVICE_URL || 'http://inventory-service-app:4001/api';

    const headers: any = {
      'Content-Type': 'application/json',
    };

    this.axiosInstance = axios.create({
      baseURL: this.inventoryBaseUrl,
      timeout: 15000, // Aumentado de 10s a 15s para mejor confiabilidad
      headers,
    });
  }

  /**
   * Obtener todos los productos desde el catálogo público
   */
  async getAllProductos(accessToken?: string): Promise<any[]> {
    try {
      // Usa ruta pública del catálogo (no requiere autenticación)
      const response = await this.axiosInstance.get('/catalogo');
      const payload = response.data?.data ?? response.data;
      return payload?.productos ?? payload ?? [];
    } catch (error: any) {
      console.error('Error al obtener productos:', error.message);
      throw new Error(`No se pudo conectar con el servicio de inventario: ${error.message}`);
    }
  }

  /**
   * Obtener producto por ID desde el catálogo público
   * MEJORADO: Con validaciones estrictas para garantizar que stockActual está presente
   */
  async getProductoById(idProducto: number, accessToken?: string): Promise<any> {
    try {
      // Usa ruta pública del catálogo (no requiere autenticación)
      const response = await this.axiosInstance.get(`/catalogo/${idProducto}`);
      
      // VALIDACIÓN 1: Verificar que la estructura de respuesta es correcta
      if (!response.data?.data || !response.data.data.hasOwnProperty('idProducto')) {
        console.error(
          `[InventoryService] Respuesta inválida para producto ${idProducto}:`,
          JSON.stringify(response.data).substring(0, 200)
        );
        throw new Error(`Respuesta inválida del servidor de inventario para producto ${idProducto}`);
      }
      
      // VALIDACIÓN 2: Verificar que el producto tenga stockActual (crítico)
      const producto = response.data.data;
      if (producto.stockActual === undefined || producto.stockActual === null) {
        console.error(
          `[InventoryService] Producto ${idProducto} sin stockActual. Producto:`,
          JSON.stringify(producto).substring(0, 300)
        );
        throw new Error(`Stock no disponible para producto ${idProducto}`);
      }
      
      // VALIDACIÓN 3: Verificar que stockActual es un número válido
      if (typeof producto.stockActual !== 'number' || producto.stockActual < 0) {
        console.error(
          `[InventoryService] Producto ${idProducto} con stockActual inválido: ${producto.stockActual}`
        );
        throw new Error(`Stock inválido para producto ${idProducto}`);
      }
      
      // VALIDACIÓN 4: Verificar que activo es booleano
      if (typeof producto.activo !== 'boolean') {
        console.warn(`[InventoryService] Producto ${idProducto} con 'activo' en tipo incorrecto, corrigiendo...`);
        producto.activo = Boolean(producto.activo);
      }
      
      console.debug(
        `[InventoryService] ✅ Producto obtenido: ID=${producto.idProducto}, ` +
        `Nombre=${producto.nombre}, Stock=${producto.stockActual}, Activo=${producto.activo}`
      );
      return producto;
      
    } catch (error: any) {
      // Si es 404, el producto no existe
      if (error.response?.status === 404) {
        console.warn(`[InventoryService] Producto ${idProducto} no encontrado (404)`);
        return null;
      }
      
      // Si es otro error, loguear y relanzar
      console.error(
        `[InventoryService] ❌ Error al obtener producto ${idProducto}:`,
        error.message
      );
      throw error instanceof Error 
        ? error 
        : new Error(`No se pudo obtener el producto ${idProducto}: ${error.message}`);
    }
  }

  /**
   * Obtener múltiples productos por IDs
   */
  async getProductosByIds(ids: number[], accessToken?: string): Promise<any[]> {
    try {
      const requests = ids.map(id => this.getProductoById(id, accessToken));
      const resultados = await Promise.all(requests);
      return resultados.filter(p => p !== null);
    } catch (error: any) {
      console.error('Error al obtener múltiples productos:', error.message);
      throw new Error(`No se pudo obtener los productos: ${error.message}`);
    }
  }

  /**
   * Validar si un producto existe
   */
  async productoExists(idProducto: number, accessToken?: string): Promise<boolean> {
    try {
      const producto = await this.getProductoById(idProducto, accessToken);
      return producto !== null;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Obtener detalles de productos para una promoción
   */
  async getProductosForPromocion(productosIds: number[], accessToken?: string): Promise<any[]> {
    try {
      return await this.getProductosByIds(productosIds, accessToken);
    } catch (error: any) {
      console.error('Error al obtener productos para promoción:', error.message);
      throw error;
    }
  }

  /**
   * Reducir stock de un producto (llamada interna)
   * 
   * @param idProducto - ID del producto
   * @param cantidad - Cantidad a reducir del stock
   * @param accessToken - Token de acceso para autenticación
   * @throws Error si no hay suficiente stock o el servicio no está disponible
   */
  async reducirStock(idProducto: number, cantidad: number, accessToken?: string): Promise<void> {
    try {
      const headers: any = {
        'Content-Type': 'application/json',
      };

      const internalToken = process.env.INTERNAL_SERVICE_TOKEN || "variablegenerica";

      if (internalToken) {
        headers['x-internal-token'] = internalToken;
        await this.axiosInstance.patch(
          `/internal/products/${idProducto}/stock`,
          { cantidadCambio: -Math.abs(cantidad) },
          { headers }
        );
      }
    } catch (error: any) {
      console.error(`Error al reducir stock del producto ${idProducto}:`, error.message);
      throw new Error(`No se pudo reducir el stock: ${error.message}`);
    }
  }
}

export default InventoryService;
