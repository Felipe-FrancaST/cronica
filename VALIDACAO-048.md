# Crônica 048 — validação da entrega

Data: 4 de novembro de 2026. Base: `cronica-atualizado-047.zip`. Versão entregue: **1.0.48**.

| Verificação                  | Resultado                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Instalação limpa             | `npm ci` aprovado em uma pasta nova, extraída do ZIP, sem dependências copiadas do projeto anterior.                                                                                                                                                                                       |
| Tipos                        | `npm run typecheck` aprovado na árvore de trabalho e na instalação limpa.                                                                                                                                                                                                                  |
| Formatação                   | `npm run format:check` aprovado.                                                                                                                                                                                                                                                           |
| Suíte local                  | **621 testes aprovados**, zero falhas, cancelamentos ou testes ignorados. Foram executados os 79 arquivos da suíte de `npm test`, com relatório TAP.                                                                                                                                       |
| Arkanis no navegador         | **2 cenários aprovados**, em larguras de 1.440 e 375 pixels: criação da campanha e da ficha, atributos/recursos, aptidão 3, catálogo/ícone, estoque, item personalizado com tag e persistência após uma nova navegação. Nenhum erro de página ou excesso de largura horizontal no diálogo. |
| Compatibilidade no navegador | **3 cenários D&D aprovados**: criação/edição/recarga, criação com acesso gratuito e conflito entre dois editores com recuperação de rascunho.                                                                                                                                              |
| Build                        | `npm run build` aprovado na instalação limpa extraída do ZIP, com Next.js 16.3.8.                                                                                                                                                                                                          |
| Catálogo e imagens           | **180 ingredientes, 18 habitats, 180 SVGs locais**. Nomes, identificadores, tags, caminhos e arquivos conferidos; todos os SVGs renderizados e revisados visualmente.                                                                                                                      |
| Histórico SQL                | As **47 migrações anteriores são idênticas, byte a byte**, às da base 047. A única migração nova é a 048.                                                                                                                                                                                  |
| Integridade                  | CRC do ZIP e hashes SHA-256 conferidos; relação em `MANIFESTO-048.json`. O código distribuído é o mesmo validado na instalação extraída.                                                                                                                                                   |

`npm run test:arkanis` executa os cinco cenários de navegador descritos acima. A integração contínua também foi preparada para executar tipos, formatação, testes locais, build e esses cenários.

## Verificações próprias de Arkanis

Os testes novos cobrem o registro independente do sistema, a ausência de classes e espaços de magia de D&D, todas as faixas de modificadores, o caso ambíguo de Arkano 75, os bônus raciais e de vínculo aplicados uma vez e a hidratação dos dados salvos.

A validação do inventário confere seleção por tag e quantidade positiva, união de registros do mesmo ingrediente, preservação de quantidade zero e ausência de consumo ao consultar a bancada. Os testes de arquivos verificam todos os 180 SVGs e rejeitam scripts ou referências remotas nos ícones.

No banco local, a migração foi aplicada com as anteriores e reaplicada com registros existentes. Foram verificadas gravações de fichas sem classes, aptidão 3, inventário independente, versão esperada, recusa de edição antiga e de recriação após exclusão, acesso de terceiros, permissões para itens personalizados e bloqueio de entradas inválidas, inclusive por acesso direto às tabelas.

A entrega de um ingrediente pelo mestre preservou o identificador, a tag, o ícone e a quantidade. A checagem administrativa confirmou a versão 48. A limpeza de mídia preservou uma imagem ainda referenciada em uma versão anterior de um item do catálogo.

## Reproduzir

Use Node.js 22 ou superior, na pasta do projeto:

```bash
npm ci
npm run typecheck
npm run format:check
npm test
npm run build
npx playwright install chromium
npm run test:arkanis
```

O comando de navegador inicia os serviços de teste e usa as portas 3100 e 54329. Execute as suítes específicas em sequência, pois compartilham essas portas. O ambiente desta validação usou Chromium 153. As larguras móveis simulam a interface responsiva; não substituem o teste em aparelhos físicos.

## Limites

Os testes de banco usam PostgreSQL local via PGlite, com autenticação e partes do Storage simuladas. Os testes de pagamento usam um provedor local. O Supabase publicado, as credenciais reais e o Mercado Pago real não foram acessados ou alterados.

Esta entrega valida os cinco cenários de navegador descritos. As demais suítes Playwright continuam no projeto, mas não foram todas repetidas na versão 048. As regras de D&D também passaram pela suíte local completa.

O preparo de poções, as combinações e o consumo de ingredientes são a próxima etapa, conforme solicitado. A ficha de Arkanis registra os recursos e o repertório; a resolução do combate continua manual, sem aplicar a automação de D&D. Os pontos ambíguos do livro permanecem documentados e sujeitos à decisão do mestre.

Os relatórios e as capturas temporárias de teste não integram o ZIP. O relatório da versão 047 está em `docs/historico` e descreve aquela entrega anterior.
