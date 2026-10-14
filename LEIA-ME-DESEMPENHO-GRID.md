# Interações mais rápidas no Grid

Atualize o código e publique pelo seu processo habitual. Se o banco já está na migração 027, esta revisão não exige SQL novo. Preserve seu `.env.local` e recarregue as abas dos participantes após a publicação.

## O que muda durante a partida

- Acender/apagar luzes, abrir/fechar passagens e controlar fechaduras pelo mestre atualiza a imagem imediatamente. O indicador de salvamento aparece apenas no elemento alterado, permitindo usar os demais controles.
- A resposta do servidor confirma o estado final. Uma falha restaura o último estado conhecido, informa o problema e sincroniza novamente a mesa. Cliques repetidos no mesmo elemento não duplicam a operação enquanto ela estiver pendente.
- Mover e excluir elementos também atualiza o Grid imediatamente. Criar, editar e configurar aproveita o elemento devolvido pelo servidor, sem recarregar terrenos, personagens, turnos e efeitos sem necessidade.
- Abrir e fechar recipientes pelo jogador utiliza a resposta da própria interação. Ao pegar um item, o inventário e os dados derivados são atualizados em segundo plano. Conteúdos privados só aparecem após a autorização do servidor; itens e chaves não são concedidos por uma prévia local.
- Mudanças de luz, nome ou aparência reutilizam os obstáculos e os índices de movimento em 2D e 3D. Abrir uma porta, mover um bloqueio ou mudar seu custo invalida esse cache corretamente.
- O cenário 3D mantém grupos de instâncias por regiões de oito células. Alterar uma peça preserva os modelos de outras regiões da mesma família. Superfícies contínuas mantêm seu agrupamento para conservar as junções.
- As consultas independentes do carregamento inicial e das sincronizações necessárias são paralelas. Paginação, escopo da sessão e restrições de acesso continuam sendo aplicados.

O mestre recebe alterações públicas de elementos pelo Realtime sem refazer toda a leitura. Os jogadores continuam revalidando a visibilidade do mapa no servidor, inclusive quando um elemento é ocultado. Respostas de consultas iniciadas antes de uma ação não apagam sua prévia ou confirmação mais recente.

## Medição local

Comparação no mesmo navegador local, com **360 elementos** e **900 ms de atraso simulado na operação de cenário**. O tempo é medido dentro do navegador entre o evento de clique e o primeiro quadro com o novo estado do botão.

| Medida                                       | Versão anterior | Esta revisão |
| -------------------------------------------- | --------------: | -----------: |
| Retorno visual                               |        1.767 ms |       732 ms |
| Leituras REST adicionais após a ação         |              11 |            0 |
| Dessas, leituras de objetos, terreno e névoa |               3 |            0 |

É uma medição local com renderização por software e rede simulada, sem acesso ao Supabase real. Não representa uma medição de FPS ou uma garantia de latência em todos os dispositivos. A gravação ainda depende da conexão e da validação do servidor; a prévia deixa a interface responder durante essa espera.

## Verificação

```bash
npm run typecheck
npm test
npm run format:check
npm run build
```

Com o Chromium do Playwright instalado:

```bash
npm run test:performance
npm run test:scenery
```

Os testes de desempenho iniciam a aplicação e uma API local isolada. Cobrem um mapa com 360 elementos, ausência de leituras extras na confirmação, controles independentes, prevenção de operação duplicada e reversão após uma rejeição. Os testes de lógica cobrem respostas fora de ordem, atualizações concorrentes, remoção por visibilidade, microssegundos dos timestamps e invalidação dos caminhos quando um obstáculo muda.

Na revisão de desempenho passaram **295 testes de lógica e banco local**, **17 fluxos de navegador**, a conferência de tipos, a formatação e o build de produção. Os fluxos de navegador incluem baús e chaves, portas ocupadas, edição em 2D/3D, superfícies contínuas, iluminação, uma cidade maior e controles no celular. A organização mais recente dos controles está no [guia do painel do mestre](LEIA-ME-PAINEL-DO-MESTRE.md).
