# Crônica 047 — validação da entrega

Data: 4 de novembro de 2026. Base: atualização 046 do arquivo `cronica(2).zip`. Versão entregue: `1.0.47`.

## Resultados

| Verificação             | Resultado                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instalação limpa        | `npm ci` aprovado em uma pasta nova, extraída do ZIP, sem dependências copiadas do projeto original.                                                       |
| Tipos                   | `npm run typecheck` aprovado na árvore de trabalho e na instalação extraída.                                                                               |
| Formatação              | `npm run format:check` aprovado.                                                                                                                           |
| Testes locais           | `npm test`: **602 aprovados, 0 falhas, 0 ignorados**. Inclui regras existentes, permissões, banco local e regressões da atualização 047.                   |
| Navegador: campanhas    | `npm run test:campaigns`: **3 aprovados**, incluindo criação, edição, recarga, acesso gratuito e conflito entre dois editores com recuperação de rascunho. |
| Navegador: mesa e mapas | `npm run test:reliability`: **14 aprovados** — alternância 2D/3D (2), combate guiado (5), biblioteca de imagens (3) e mapas no mural (4).                  |
| Produção                | `npm run build` aprovado na árvore de trabalho e na instalação limpa extraída do ZIP, usando Next.js 16.3.8.                                               |
| Histórico SQL           | As **46 migrações anteriores são idênticas, byte a byte**, às do ZIP enviado. A única migração nova é a 047.                                               |
| Integridade do pacote   | Verificação CRC do ZIP e hashes SHA-256 dos arquivos distribuídos; relação em `MANIFESTO-047.json`.                                                        |

O código validado na instalação extraída é o mesmo distribuído. O relatório final e o manifesto documentam essa validação e são incluídos na entrega final. Dependências, builds, relatórios temporários de navegador e o histórico Git não são necessários para a instalação e não acompanham o pacote.

## Regressões específicas da atualização

- Paginação com mais de 1.000 registros e com limite da API menor que o tamanho solicitado, incluindo tabelas filhas e consultas por lotes.
- Escopo por tela/campanha, reutilização dos dados carregados e agrupamento de atualizações concorrentes, mantendo a proteção contra respostas antigas e troca de sessão.
- Gravação de campanhas e lugares com versão esperada, recusa de conteúdo antigo, preservação de segredos, proteção contra recriação após exclusão e recuperação da confirmação de uma gravação repetida.
- Resumos que respeitam RLS, permissões das funções novas e reaplicação da migração.
- Fila de mídia, períodos de proteção, leases, repetição após falha, confirmação da API, referências no histórico, reservas abandonadas, cota preventiva e disputa entre confirmação de upload antigo e limpeza.
- Leitura do corpo da requisição limitada por bytes e por fluxo, inclusive sem `Content-Length`.
- Recuperação de pagamentos com mais de cinco eventos e respeito ao orçamento de execução.
- No navegador, publicação no mural após perda da resposta sem duplicação nem exposição de notas privadas; persistência de símbolos e tokens; edição colaborativa; desenho com rede lenta; visualização com largura móvel; combate e troca de renderizador.

## Reproduzir

Na pasta do projeto, usando Node.js 22 ou superior:

```bash
npm ci
npm run typecheck
npm run format:check
npm test
npm run build
npx playwright install chromium
npm run test:campaigns
npm run test:reliability
```

Os comandos específicos de navegador iniciam os serviços de teste necessários. As duas suítes devem ser executadas em sequência, pois usam as mesmas portas. O ambiente desta validação usou Chromium 153, incluindo larguras de 375 e 1.440 pixels; isso verifica a interface responsiva em navegador, sem substituir testes em aparelhos físicos.

## Alcance da validação

Os testes de banco usam PostgreSQL local via PGlite, com autenticação e partes do Storage simuladas. Os testes de pagamentos usam um provedor de teste. Os testes de navegador cobrem os 17 cenários descritos acima; as demais suítes Playwright existentes continuam incluídas, mas não foram todas executadas nesta entrega.

O site publicado, o Supabase real, as credenciais reais e o Mercado Pago real não foram acessados ou alterados. A migração de produção, a publicação e a ativação do agendador dependem da aplicação do guia `LEIA-ME-ATUALIZACAO.md`. O build aprovado não confirma a configuração desses serviços externos.
