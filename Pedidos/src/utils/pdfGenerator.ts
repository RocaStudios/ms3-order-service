import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { Pedido } from '../domain/models/pedido';
import { ProductoPedido } from '../domain/models/productoPedido';

export interface ReciboPedidoData {
  pedido: Pedido;
  productos: ProductoPedido[];
  nombreMesa?: string;
  nombresProductos?: Map<number, string>;
  metodosPago?: Array<{
    nombreMetodo: string;
    monto: number;
  }>;
  totalFinal?: number;
  montoRecibidoEfectivo?: number;
  vuelto?: number;
}

/**
 * Genera un recibo en PDF para un pedido
 * @param data - Datos del pedido y productos
 * @returns Ruta del archivo PDF generado
 */
export const generarReciboPDF = async (data: ReciboPedidoData): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      // Crear directorio de recibos si no existe
      const recibosDir = path.join(process.cwd(), process.env.RECEIPTS_DIR || 'recibos');
      if (!fs.existsSync(recibosDir)) {
        fs.mkdirSync(recibosDir, { recursive: true });
      }

      // Generar nombre de archivo único
      const fileName = `recibo_pedido_${data.pedido.idPedido}_${Date.now()}.pdf`;
      const filePath = path.join(recibosDir, fileName);

      // Crear documento PDF
      const doc = new PDFDocument({ size: 'A4', margin: 50 });

      // Pipe a archivo
      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // Encabezado
      doc
        .fontSize(20)
        .text('RECIBO DE PEDIDO', { align: 'center' })
        .moveDown();

      // Información del pedido
      doc
        .fontSize(12)
        .text(`Pedido #${data.pedido.idPedido}`, { align: 'left' })
        .text(`Fecha: ${new Date(data.pedido.fechaPedido).toLocaleString('es-ES')}`)
        .text(`Estado: ${data.pedido.estado.toUpperCase()}`)
        .text(`Canal: ${data.pedido.canalVenta}`)
        .moveDown();

      // Información de mesa si aplica
      if (data.pedido.idMesa) {
        doc
          .text(`Mesa: ${data.nombreMesa || `#${data.pedido.idMesa}`}`)
          .moveDown();
      } else {
        doc
          .text('Tipo: PARA LLEVAR')
          .moveDown();
      }

      // Dirección de entrega si aplica
      if (data.pedido.direccionEntrega) {
        doc
          .text(`Dirección de entrega: ${data.pedido.direccionEntrega}`)
          .moveDown();
      }

      // Línea separadora
      doc
        .moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .stroke()
        .moveDown();

      // Encabezado de tabla de productos
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('Producto', 50, doc.y, { width: 220, continued: true })
        .text('Cant.', { width: 60, continued: true })
        .text('P. Unit.', { width: 80, continued: true })
        .text('Subtotal', { width: 80, align: 'right' })
        .font('Helvetica')
        .moveDown(0.5);

      // Productos
      data.productos.forEach((producto) => {
        const yPos = doc.y;
        const nombreProducto = data.nombresProductos?.get(producto.idProducto) || `Producto ${producto.idProducto}`;
        const tituloProducto = `ID: ${producto.idProducto} - ${nombreProducto}`;
        
        doc
          .fontSize(10)
          .text(tituloProducto, 50, yPos, { width: 220 })
          .text(`${producto.cantidad}`, 270, yPos, { width: 60 })
          .text(`$${Number(producto.precioUnitario).toFixed(2)}`, 330, yPos, { width: 80 })
          .text(`$${Number(producto.subtotal).toFixed(2)}`, 410, yPos, { width: 80, align: 'right' });

        doc.moveDown(0.5);
      });

      if (data.metodosPago && data.metodosPago.length > 0) {
        doc
          .moveDown(0.5)
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('Desglose de pago por método', { align: 'left' })
          .font('Helvetica')
          .moveDown(0.4);

        data.metodosPago.forEach((metodo) => {
          doc
            .fontSize(10)
            .text(`${metodo.nombreMetodo}`, 50, doc.y, { width: 320, continued: true })
            .text(`$${Number(metodo.monto).toFixed(2)}`, { width: 120, align: 'right' });
        });

        doc.moveDown(0.5);
      }

      // Línea separadora
      doc
        .moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .stroke()
        .moveDown();

      // Total
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(`TOTAL: $${Number(data.totalFinal ?? data.pedido.total).toFixed(2)}`, { align: 'right' })
        .font('Helvetica')
        .moveDown(0.8);

      if (data.montoRecibidoEfectivo !== undefined) {
        doc
          .fontSize(11)
          .text(`Efectivo recibido: $${Number(data.montoRecibidoEfectivo).toFixed(2)}`, { align: 'right' });
      }

      if (data.vuelto !== undefined && Number(data.vuelto) > 0) {
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .text(`VUELTO: $${Number(data.vuelto).toFixed(2)}`, { align: 'right' })
          .font('Helvetica');
      }

      doc.moveDown(1.4);

      // Pie de página
      doc
        .fontSize(10)
        .text('¡Gracias por su preferencia!', { align: 'center' })
        .moveDown(0.5)
        .fontSize(8)
        .fillColor('#666666')
        .text('Este documento es un comprobante de pedido', { align: 'center' });

      // Finalizar PDF
      doc.end();

      // Esperar a que se termine de escribir
      writeStream.on('finish', () => {
        resolve(filePath);
      });

      writeStream.on('error', (error) => {
        reject(error);
      });

    } catch (error) {
      reject(error);
    }
  });
};
