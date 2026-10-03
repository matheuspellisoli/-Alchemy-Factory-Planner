# Alchemy Factory Planner

Planner para o jogo Alchemy Factory. Escolha o que quer produzir e quanto por minuto, e ele calcula as máquinas, esteiras, fornalhas, combustível e fertilizante da fábrica, desenha o fluxo e mostra a ordem de montagem.

Site estático, sem build nem dependências. Disponível em português, inglês e espanhol.

## Como usar

Abra `index.html` no navegador.

O passo a passo, com capturas de tela, está no tutorial: [português](tutorial.html) · [English](tutorial.en.html) · [español](tutorial.es.html).

## Recursos

- **Cálculo automático:** máquinas inteiras, carga de cada uma, entradas e sobras por minuto.
- **Aquecimento:** cada máquina quente fica sobre uma fornalha, com o consumo real de combustível.
- **Plantio:** Nursery ou Seed Plot, com o gasto de fertilizante.
- **Linhas de insumo:** combustível e fertilizante podem ser produzidos dentro da própria fábrica, inclusive em ciclos.
- **Visualização:** visão geral, linhas em Clusters ou Colunas, e cada bloco com todas as máquinas e esteiras.
- **Ordem de montagem:** os blocos na ordem em que devem ser construídos.
- **Salvar e compartilhar:** fábricas salvas no navegador, código `AFP1.` para exportar/importar e link com a fábrica (`?fabrica=`).

## Cálculos

Valores de calor e nutrientes do [Alchemy Factory Codex](https://alchemy-factory-codex.com/).

- **Máquinas:** demanda ÷ (saída da receita × 60 ÷ segundos × velocidade), arredondado para cima uma vez por receita.
- **Combustível/min:** (calor da máquina + calor da fornalha) × máquinas × 60 ÷ `heatValue`.
- **Ervas/min por Nursery:** 60 × `nutrientsPerSecond` ÷ `requiredNutrients`.
- **Fertilizante/min:** ervas/min × `requiredNutrients` ÷ `nutrientValue`.

## Estrutura

| Caminho | Conteúdo |
| --- | --- |
| `index.html` | Página inicial. |
| `planner.html` | O planner. |
| `tutorial*.html` | Tutorial nos três idiomas. |
| `app.js` | Estado, cálculo, tabelas, salvar e exportar. |
| `flow.js` | Diagrama em HTML + SVG. |
| `i18n.js` | Traduções (`?lang=pt\|en\|es`). |
| `static/data/database.js` | Recursos, máquinas e receitas. |
| `static/` | Ícones, logo e capturas do tutorial. |
