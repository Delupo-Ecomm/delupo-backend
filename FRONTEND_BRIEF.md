# Brief Frontend - Delupo Stats

## Contexto
Este repositorio contem o backend de ingestao de pedidos da VTEX para o ecommerce da Delupo. O frontend deve consumir a API deste backend para dashboards e analises de ecommerce. Use este arquivo como guia para iniciar o frontend em um repositorio separado.

## Objetivo
Criar um frontend para analiticas de ecommerce com foco em:
- Visao geral de receita, pedidos, ticket medio, taxa de conversao
- Funis de compra e performance por canal
- Analise de produtos e SKUs (top sellers, margem, descontos)
- Analise de clientes (novos vs recorrentes, LTV, cohort)
- Analise de campanhas (UTM source/medium/campaign)
- Logistica (prazo, custo, transportadoras, SLA)
- Pagamentos (meio de pagamento, parcelas, status)

## Backend atual
- Linguagem: Node.js + TypeScript
- ORM: Prisma
- Banco: Postgres
- Ingestao VTEX: ultimos 30 dias, com detalhes de pedidos
- Porta API: 3000

## Entidades principais (resumo)
- orders: pedido com valores, status, utm, afiliados
- order_items: itens e precos por SKU
- customers: dados de cliente
- products / skus: catalogo basico
- order_payments: pagamentos e parcelas
- order_shipping: entregas e prazos
- order_promotions: beneficios e descontos

## Requisitos de UI
- Dashboard responsivo
- Design limpo e focado em dados
- Filtros por periodo, status, canal, UTM
- Tabelas com exportacao CSV
- Graficos com comparacao periodos (MoM, YoY)

## Sugestao de stack frontend
- React + Vite
- Tailwind CSS
- Recharts ou ECharts
- TanStack Query

## Endpoints esperados (a confirmar)
- GET /health
- GET /metrics/summary?start=&end=&status=
- GET /metrics/orders?start=&end=&status=
- GET /metrics/products?start=&end=&limit=&status=
- GET /metrics/customers?start=&end=&limit=&status=
- GET /metrics/utm?start=&end=&limit=&status=
- GET /metrics/shipping?start=&end=&limit=&status=
- GET /metrics/payments?start=&end=&limit=&status=

## Formato dos dados (API)
Observacao: valores monetarios sao inteiros em centavos (padrao VTEX). Datas seguem o fuso `America/Sao_Paulo` por padrao. As metricas consideram apenas pedidos da politica comercial principal (`salesChannel=1`).

### GET /health
Resposta:
```json
{ "status": "ok" }
```

### GET /metrics/summary
Query: `start` e `end` (ISO date). Se omitidos, usa os ultimos 30 dias. `status` pode ser uma lista separada por virgula (ex.: `invoiced,canceled`).
Resposta:
```json
{
  "start": "2024-01-01",
  "end": "2024-01-31",
  "orders": 123,
  "customers": 85,
  "totalRevenue": 3456700,
  "avgOrderValue": 28103,
  "itemsValue": 3100000,
  "shippingValue": 280000,
  "discountsValue": 120000,
  "taxValue": 0
}
```

### GET /metrics/orders
Serie diaria de pedidos e receita.
Resposta:
```json
{
  "start": "2024-01-01",
  "end": "2024-01-31",
  "series": [
    { "day": "2024-01-01", "orders": 12, "revenue": 345670 },
    { "day": "2024-01-02", "orders": 18, "revenue": 512340 }
  ]
}
```

### GET /metrics/products
Top SKUs/produtos por receita e quantidade.
Resposta:
```json
{
  "start": "2024-01-01",
  "end": "2024-01-31",
  "items": [
    {
      "skuId": "clw2a1x0b0001",
      "productId": "clw2a1x0b0009",
      "skuName": "Camisa Slim P",
      "productName": "Camisa Slim",
      "quantity": 120,
      "revenue": 890000
    }
  ]
}
```

### GET /metrics/customers
Coortes simples (novos vs recorrentes) + top clientes por receita.
Resposta:
```json
{
  "start": "2024-01-01",
  "end": "2024-01-31",
  "cohorts": { "newCustomers": 35, "returningCustomers": 50 },
  "topCustomers": [
    {
      "customerId": "clw2a1x0b0010",
      "email": "cliente@email.com",
      "name": "Maria Silva",
      "orders": 5,
      "revenue": 145000
    }
  ]
}
```

### GET /metrics/utm
Performance por UTM source/medium/campaign.
Resposta:
```json
{
  "start": "2024-01-01",
  "end": "2024-01-31",
  "items": [
    {
      "utmSource": "google",
      "utmMedium": "cpc",
      "utmCampaign": "verao-2024",
      "orders": 30,
      "revenue": 780000
    }
  ]
}
```

### GET /metrics/shipping
Analise por transportadora/canal/SLA.
Resposta:
```json
{
  "start": "2024-01-01",
  "end": "2024-01-31",
  "items": [
    {
      "carrier": "Correios",
      "deliveryChannel": "delivery",
      "shippingSla": "PAC",
      "shipments": 40,
      "revenue": 900000,
      "shippingValue": 85000
    }
  ]
}
```

### GET /metrics/payments
Meios de pagamento.
Resposta:
```json
{
  "start": "2024-01-01",
  "end": "2024-01-31",
  "items": [
    {
      "paymentGroup": "creditCard",
      "paymentName": "Visa",
      "payments": 60,
      "revenue": 1200000
    }
  ]
}
```

## Observacoes
- A API ainda esta em desenvolvimento. Os endpoints acima sao o escopo esperado.
- A base armazena o JSON bruto do pedido, entao novas metricas podem ser derivadas.
