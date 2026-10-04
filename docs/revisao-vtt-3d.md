# Revisão e atualização do VTT

O campo de batalha passou do Canvas 2D para uma cena 3D, preservando a vista 2D como alternativa. A revisão incluiu a estrutura Next.js, tipagem do site, repositórios, autenticação/retornos, uploads privados, regras D&D, controles da mesa, CSS responsivo e migrações de acesso.

## Alterações entregues

| Área | Resultado |
| --- | --- |
| Grid 3D | Tabuleiro com espessura, iluminação, sombras e obstáculos elevados |
| Peças | Bases geométricas, retratos/iniciais, identificação de seleção/turno e animação de deslocamento |
| Câmera | Zoom, rotação, navegação, vista superior/isométrica, foco e tela cheia |
| Celular | Gestos separados de movimento, pinça segura e confirmação de destino por segundo toque |
| Compatibilidade | Vista 2D e abertura automática em 2D quando o contexto WebGL falha |
| Desempenho | Desenho sob demanda, modo leve, terrenos instanciados e liberação dos recursos da GPU |
| Mapas grandes | Consultas paginadas para evitar truncar os terrenos no limite de resposta do Supabase |
| Sincronização | Respostas antigas não substituem cargas mais recentes; Realtime com agrupamento de eventos, atualização ao voltar à aba e recarga periódica |
| Formulários | Erros de upload aparecem na configuração do mapa; exclusão do mapa exige confirmação na interface |
| Testes SQL | Chamadas que retornam registros usam `SELECT * FROM função(...)`, evitando executar funções de mutação uma vez por coluna |

A renderização e os controles foram separados em módulos próprios. O renderer 3D recebe as mesmas entidades usadas pelo 2D e não decide autorização nem escreve diretamente nas posições dos tokens.

## Verificações

- TypeScript de todo o projeto: aprovado.
- Build de produção Next.js: aprovado.
- 36 testes de regras, projeção, controle, limite de caminho e PostgreSQL/RLS: aprovados.
- 10 cenários de navegador do VTT: aprovados, incluindo movimento, terreno, jogador fora de turno, ocultação, navegação, toque, pinça, foco, paginação e falha de WebGL.
- Fluxos gerais de campanha, ficha, mundo, NPC, alternância de modo e navegação mobile: validados pela suíte de navegador do projeto.

Os testes de navegador do VTT usam uma API de dados local isolada. Os testes de segurança executam as migrações em PostgreSQL local via PGlite. Autenticação/email reais, uploads para Storage, Realtime entre duas contas e publicação continuam dependendo da configuração do seu Supabase e hospedagem.

## Usar a atualização

Execute `npm ci` e depois `npm run dev`, ou `npm run build` para publicar. O lockfile inclui as dependências do renderer. Abra a mesa da campanha e selecione 3D.

Esta entrega não adiciona migrações. As instruções completas de instalação, controles e escopo estão em `docs/vtt.md`.
