import pLimit from "p-limit";
import { prisma } from "./db.js";
import { upsertOrder, fetchOrderDetail } from "./order-processor.js";

const limit = pLimit(30); // Processar 20 pedidos em paralelo

async function updateAllOrders() {
  console.log("Buscando todos os pedidos...");
  
  const orders = await prisma.order.findMany({
    select: {
      vtexOrderId: true,
    },
    orderBy: {
      creationDate: "desc",
    },
  });

  console.log(`Encontrados ${orders.length} pedidos para atualizar`);

  let processed = 0;
  let errors = 0;
  const startTime = Date.now();

  const tasks = orders.map((order) =>
    limit(async () => {
      try {
        const detail = await fetchOrderDetail(order.vtexOrderId);
        await upsertOrder(detail);
        processed++;
        
        if (processed % 50 === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = processed / elapsed;
          const remaining = orders.length - processed;
          const eta = remaining / rate;
          console.log(
            `Processados: ${processed}/${orders.length} (${((processed / orders.length) * 100).toFixed(1)}%) | ` +
            `Erros: ${errors} | ` +
            `Taxa: ${rate.toFixed(1)}/s | ` +
            `ETA: ${Math.ceil(eta / 60)} min`
          );
        }
      } catch (error) {
        errors++;
        console.error(`Erro ao processar pedido ${order.vtexOrderId}:`, error instanceof Error ? error.message : error);
      }
    })
  );

  await Promise.all(tasks);

  console.log("\n=== Atualização concluída ===");
  console.log(`Total processado: ${processed}`);
  console.log(`Total de erros: ${errors}`);
  console.log(`Taxa de sucesso: ${((processed / orders.length) * 100).toFixed(2)}%`);
  console.log(`Tempo total: ${Math.ceil((Date.now() - startTime) / 60000)} minutos`);

  await prisma.$disconnect();
}

updateAllOrders().catch((error) => {
  console.error("Erro fatal:", error);
  process.exit(1);
});
