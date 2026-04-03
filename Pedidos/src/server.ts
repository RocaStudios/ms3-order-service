console.log("🚀 [SERVER-TRACE] Iniciando server.ts...");
import dotenv from 'dotenv';
dotenv.config();

import app from "./app";


const PORT = process.env.PORT;

async function startServer() {
  // Inicializar Base de Datos y sincronizar modelos en desarrollo
  try {
    const { initializeDB, seedMetodosPago } = await import("./config/db");
    const sequelize = await initializeDB();
    if (process.env.NODE_ENV !== "production") {
      await sequelize.sync({ alter: true });
      console.log("✅ Modelos sincronizados con la base de datos");
      
      // Ejecutar seed de métodos de pago
      await seedMetodosPago();
    }
  } catch (err) {
    console.error("❌ Error inicializando la base de datos:", err);
  }

  app.listen(Number(PORT), '0.0.0.0', () => console.log("✅ Servidor corriendo en", PORT, "puedes consumir la API Eventos y Promociones"));
}

startServer()