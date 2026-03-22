import mysql from "mysql2/promise";
import { Sequelize } from "sequelize-typescript";

//Importacion de modelos
import {
  MetodoPago, Pago, PagoDetalle, Pedido, ProductoPedido
} from "../domain/models"

//Importar credenciales
const DB_HOST = process.env.DB_HOST || "mysql"; 
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "MiContraseñaSegura123!";
const DB_NAME = process.env.DB_NAME || "don_papa";

// Export sequelize instance for transactions
export let sequelizeInstance: Sequelize;

export async function initializeDB() {
  // 1. Crear BD si no existe (con mysql2) - con reintentos
  let connection;
  let attempts = 0;
  const maxAttempts = 30;
  const delayMs = 2000;

  while (attempts < maxAttempts) {
    try {
      connection = await mysql.createConnection({
        host: DB_HOST,
        user: DB_USER,
        password: DB_PASSWORD,
      });
      console.log("✅ Conexión a MySQL establecida");
      break;
    } catch (error) {
      attempts++;
      console.log(`⏳ Intento ${attempts}/${maxAttempts} de conectar a MySQL en ${DB_HOST}...`);
      if (attempts >= maxAttempts) {
        console.error("❌ No se pudo conectar a MySQL después de varios intentos");
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  await connection!.query(`CREATE DATABASE IF NOT EXISTS ${DB_NAME}`);
  await connection!.end();

  // 2. Conexión principal con Sequelize
  const sequelize = new Sequelize({
    host: DB_HOST,
    dialect: "mysql",
    username: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    models: [
      MetodoPago, Pago, PagoDetalle, Pedido, ProductoPedido
    ],
    logging: false, // Desactiva logs de SQL en producción
  });

  // Store instance for DI and transactions
  sequelizeInstance = sequelize;

  return sequelize;
}

/**
 * Seed de métodos de pago
 * Crea los métodos de pago básicos si no existen
 */
export async function seedMetodosPago() {
  try {
    const metodosExistentes = await MetodoPago.count();
    
    if (metodosExistentes > 0) {
      console.log(`✅ Métodos de pago ya existen (${metodosExistentes} registros)`);
      return;
    }

    const metodos = [
      { nombre: 'Efectivo' },
      { nombre: 'Transferencia' },
      { nombre: 'Tarjeta' }
    ];

    await MetodoPago.bulkCreate(metodos);
    console.log(`✅ Seed de métodos de pago creado: ${metodos.map(m => m.nombre).join(', ')}`);
  } catch (error) {
    console.error("❌ Error en seed de métodos de pago:", error);
  }
}