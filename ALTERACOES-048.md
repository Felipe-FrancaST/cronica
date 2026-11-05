# Crônica 048 — Arkanis, ficha e ingredientes

Base: `cronica-atualizado-047.zip`. Versão npm: **1.0.48**. Migração nova: **048**.

| Entrega            | Comportamento                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Segundo sistema    | Arkanis registrado no seletor de campanhas, no carregador de fichas e na demonstração. D&D 5e continua disponível.                                                                         |
| Ficha independente | Dossiê sem classes, com navegação e visual próprios: identidade, essência, aptidões, arsenal/técnicas, grimório, bolsa e alquimia.                                                         |
| Recursos e regras  | Atributos FOR/AGI/RES/INT/SEN/PRE, tabela própria de modificadores, Corpo/Mente/Espírito, Arkano, Mana, Sanidade, Reflexos, VA e DUR.                                                      |
| Repertório         | Armas com maestria, técnicas com NA e requisitos, e grimório com seis ordens, custos, materiais, tempo e efeitos.                                                                          |
| Biblioteca         | Os 180 ingredientes enviados, em 18 habitats, com nomes e afinidades preservados. Pesquisa aceita nomes sem acentos; filtro por habitat e paginação de 24 registros.                       |
| Ícones             | 180 SVGs originais em `public/icons/arkanis/ingredients`; ilustrações por material/habitat, renderizáveis sem serviços externos. Gerador incluído em `scripts/generate-arkanis-icons.mjs`. |
| Inventário         | Identificador de catálogo, tag ingredientes, quantidades e ícones persistidos. Quantidade zero preserva o registro e retira o material da lista disponível.                                |
| Mestre             | Formulário próprio para objetos de Arkanis e seleção dos ingredientes no catálogo de itens da campanha. Entregas usam o fluxo existente.                                                   |
| Integridade        | RPC transacional de Arkanis com versão esperada, recusa de formulário antigo e de recriação após exclusão. RLS e permissões de inventário permanecem em vigor.                             |
| Recuperação        | Rascunho local da ficha, com versão original preservada. Upload de retrato usa o armazenamento existente.                                                                                  |
| Compatibilidade    | Validadores de D&D são mantidos para D&D e deixam de interpretar fichas de Arkanis. Campanhas existentes e migrações 001–047 são preservadas.                                              |

Esta é a **primeira etapa da alquimia**: catálogo, ícones, marcação e organização dos materiais. O preparo de poções, suas receitas, testes e consumo serão implementados depois, conforme solicitado. O catálogo não concede ingredientes automaticamente e não aplica efeitos de poção.

O livro não especifica completamente alguns cálculos e contém divergências. A ficha mantém campos de decisão do mestre, descritos em `docs/arkanis-048.md`, em vez de esconder uma regra inventada.

A integração de imagens de itens também amplia a verificação de referências da limpeza de mídia: objetos atuais, inventários e versões arquivadas de definições preservam as imagens que ainda utilizam. A troca dessas referências usa a mesma proteção contra arquivos em limpeza.

A implantação e a migração em produção não foram executadas. Siga `LEIA-ME-ATUALIZACAO.md`; os resultados da validação local estão em `VALIDACAO-048.md`.
