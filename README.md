# Alchemy Factory Planner

Planner para o jogo Alchemy Factory: você escolhe o que quer produzir e quanto por minuto, e ele calcula as máquinas, esteiras, fornalhas, combustível e fertilizante da fábrica, desenha o fluxo e mostra a ordem de montagem.

É um site estático, sem build nem dependências: HTML, CSS e JavaScript puro.

## Rodar localmente

Abra `index.html` no navegador.

## Páginas

| Arquivo | O que é |
| --- | --- |
| `index.html` | Página inicial, com a apresentação e os links para o planner e o tutorial. |
| `planner.html` | O planner. |
| `tutorial.html`, `tutorial.en.html`, `tutorial.es.html` | Tutorial em português, inglês e espanhol, com capturas de tela. No planner, abre pelo ícone ❓ no idioma atual. |

## Usando o planner

A tela tem o diagrama no centro e, em volta:

- **Barra de título:** nome da fábrica (clique para editar), ⬆ Exportar, ⬇ Importar e o seletor de idioma.
- **Barra de atividades:** 🏭 Fábricas salvas, 🗂 Ordem de montagem, ⚙ Ajustes, ❓ Tutorial e ▤ painel de tabelas.
- **Abas:** ◇ Geral, ⛓ Linha e uma aba ▦ Linha … para cada bloco aberto.
- **Painel de baixo:** tabelas Plano, Recursos, Máquinas e Receitas.
- **Barra de status:** métricas da fábrica e zoom.

### Níveis do fluxo

- **◇ Geral:** matérias-primas → fábrica como um bloco → saídas. É aqui que se adicionam as saídas e as metas por minuto. O nó Fábrica mostra as entradas (em roxo, os insumos produzidos pela própria fábrica), as saídas, as máquinas e os padrões de aquecimento, plantio e fertilizante.
- **⛓ Linha:** cada receita é um nó de máquina com suas entradas e saídas; entre duas máquinas fica o nó do item transportado, com taxa e número de esteiras. Sobras aparecem tracejadas. Há duas organizações:
  - **Clusters:** um bloco por ingrediente da receita final, mais um bloco por linha de combustível ou fertilizante. Um clique no bloco dá zoom; o cadeado 🔒 (fechado por padrão) libera o arraste do bloco e dos nós.
  - **Colunas:** um grafo único da esquerda para a direita.
- **▦ Linha …:** aberta pelo botão ⤢ Linha completa. Mostra cada máquina física como um nó e cada esteira necessária (taxa ÷ Esteira/min), com as fronteiras do bloco como entradas e saídas. Várias podem ficar abertas, cada uma com o próprio zoom. Máquinas da mesma receita quebram em sub-colunas de 8.

A **Ordem de montagem** (🗂) lista os blocos na ordem em que devem ser construídos (cada bloco depois dos que o abastecem), com os botões 🔍 Zoom e ⤢ Linha completa.

Trocar receita, fornalha, combustível ou fertilizante recalcula o plano mantendo a vista e destaca as máquinas que entraram ou saíram.

### Aquecimento

Máquinas quentes (as que têm `heatSpeed`: Crucible, Kiln, Athanor, Alembic, Iron Smelter…) ficam em cima de uma fornalha, uma Stone Furnace ou Blast Furnace por máquina física, e a fornalha queima o combustível.

- A fornalha e o combustível padrão ficam no nó Fábrica.
- Cada máquina pode ter fornalha e combustível escolhidos à mão. Essas escolhas não mudam quando o padrão muda; a opção "Padrão (…)" volta a seguir o padrão.

### Plantio e fertilizante

Ervas podem ser plantadas de duas formas, com padrão da fábrica e escolha manual por erva:

- **Nursery:** a semente fica plantada e não é consumida. Gasta fertilizante, que define a velocidade.
- **Seed Plot:** consome a semente na proporção da receita (ex.: 1 Chamomile Seeds → 140 Chamomile em 1120 s) e não usa fertilizante.

O fertilizante segue o mesmo esquema do combustível: padrão da fábrica e escolha manual por máquina.

### Linhas de insumo e ciclos

Combustível e fertilizante vêm de fora por padrão. Se forem fabricáveis, "+ Linha de produção" adiciona à fábrica a cadeia que os produz (como um bloco próprio, "Combustível · X" ou "Fertilizante · X"), e "✓ Linha própria" a remove (`settings.supplyLines`).

Ciclos (ex.: a linha de Charcoal Powder precisa de Charcoal, cujo Crucible queima Charcoal Powder) são fechados por iteração: a linha produz também o que ela mesma consome, e a volta aparece como uma aresta pontilhada roxa. Se o ciclo consome mais do que produz, esse consumo vem de fora e a Fábrica avisa.

## Cálculos

Os valores de calor e nutrientes seguem as calculadoras do [Alchemy Factory Codex](https://alchemy-factory-codex.com/).

- **Máquinas:** demanda ÷ produção por máquina (saída da receita × 60 ÷ segundos × velocidade). Com "Arredondar máquinas", o trabalho exato de cada receita é somado e arredondado para cima uma única vez (4,8 → 5 máquinas a 96% de carga); entradas, sobras e calor seguem o trabalho real.
- **Combustível/min:** (`heatSpeed` da máquina × máquinas + `heatSpeed` da fornalha × fornalhas) × velocidade × 60 ÷ `heatValue` do combustível.
- **Ervas/min por Nursery:** 60 × `nutrientsPerSecond` do fertilizante ÷ `requiredNutrients` da erva, limitado pela esteira.
- **Fertilizante/min:** ervas/min × `requiredNutrients` ÷ `nutrientValue`.
- **Esteiras:** taxa do item ÷ Esteira/min, arredondado para cima.

Exemplo: Chamomile (720) com Basic Fertilizer (144 V, 12 V/s) dá 1 erva/min por Nursery e gasta 5 fertilizantes por erva; com Advanced Fertilizer (720 V, 144 V/s), 12 ervas/min e 1 fertilizante por erva.

## Salvar e compartilhar

- **Link:** a cada mudança, o endereço ganha `?fabrica=<código AFP1>` (ou `#fabrica=` se o navegador não permitir mudar a query). Abrir o link recria a fábrica, então recarregar não perde o plano. Sem o parâmetro, o planner abre vazio.
- **Código:** ⬆ Exportar gera um texto base64 com prefixo `AFP1.` contendo as saídas e todas as escolhas (receitas, fornalha, combustível, fertilizante, plantio, linhas de insumo e ajustes), sem o banco de itens. ⬇ Importar recria a fábrica a partir dele.
- **Fábricas salvas (🏭):** 💾 Salvar grava a fábrica no `localStorage` (atualiza se já existe), + Nova começa uma vazia, e a lista abre ou exclui cada fábrica. A aberta fica destacada e mostra "● não salvo" quando há mudanças. Cada fábrica guarda também o estado das abas (aba ativa, linhas abertas e o zoom de cada uma), lembrado mesmo sem clicar em Salvar.
- **Exportar JSON** (em ⚙ Ajustes) baixa o estado completo.

## Idiomas

O planner, a página inicial e o tutorial estão em português (BR), inglês e espanhol.

- Os textos ficam em `i18n.js`. No JavaScript, use `t("chave", { variaveis })`; no HTML, os atributos `data-i18n`, `data-i18n-title`, `data-i18n-aria` e `data-i18n-placeholder`. Links com `data-i18n-tutorial` apontam para o tutorial do idioma atual.
- O idioma vem, nesta ordem, de `?lang=pt|en|es` no endereço, da última escolha salva no navegador e do idioma do navegador (inglês se nenhum bater). Pode ser trocado pelo seletor 🌐.
- As capturas do tutorial ficam em `static/tutorial/` (português), `static/tutorial/en/` e `static/tutorial/es/`.

## Estrutura

| Caminho | Conteúdo |
| --- | --- |
| `app.js` | Estado, cálculo do plano, tabelas, fábricas salvas, exportar/importar e URL. |
| `flow.js`, `flow.css` | Diagrama em HTML + SVG: níveis, layout, blocos, abas de linha e ordem de montagem. |
| `icon-select.js` | Seletores com ícones (mantém o `<select>` nativo escondido como dono do valor). |
| `i18n.js` | Traduções e troca de idioma. |
| `styles.css` | Tema e layout do planner. As cores vêm do logo e estão em variáveis no `:root`; os títulos usam a fonte Cinzel. |
| `landing.css`, `tutorial.css` | Estilos da página inicial e do tutorial. |
| `static/data/database.js` | Base de dados, carregada como script para o app funcionar aberto direto do arquivo. |
| `static/icons/` | Ícones de itens e máquinas. |
| `static/brand/` | Logo, emblema e favicon. |
| `mockups/` | Protótipos estáticos dos layouts Clusters e Colunas. |

## Base de dados

`static/data/database.js` define `window.AFC_DATABASE` com:

- `resources`: matérias-primas, intermediários, produtos e sobras. Combustíveis têm `heatValue`, ervas têm `requiredNutrients` e fertilizantes têm `nutrientValue` e `nutrientsPerSecond`.
- `machines`: máquinas, com categoria, multiplicador de velocidade e `heatSpeed` (calor por segundo, em máquinas quentes e fornalhas).
- `recipes`: receitas com máquina, duração em segundos, entradas e saídas.
- `source`: origem dos dados.

Exemplo de receita:

```json
{
  "id": "rec-growth-potion",
  "name": "Growth Potion",
  "category": "Potions",
  "machineId": "mac-advanced-blender",
  "seconds": 6,
  "inputs": { "Chamomile Powder": 2, "Clay Powder": 6, "Brine": 80 },
  "outputs": { "Growth Potion": 1 }
}
```
