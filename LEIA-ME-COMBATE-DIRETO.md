# Combate direto — atualização 038

Execute `supabase/migrations/202610230038_direct_combat.sql` no SQL Editor do Supabase **depois da 037**. Em seguida, publique o código atualizado. Não execute `supabase/schema.sql` em uma instalação existente; ele reúne todas as migrações para instalação nova.

## Para jogar

- No próprio turno, o jogador vê apenas seu personagem: PV, CA, deslocamento, ficha e ações.
- Atacar e conjurar abrem a seleção no centro da tela. Escolha a arma ou magia, confirme e indique o alvo ou área no grid. Ajustes de espaço de magia e opções específicas continuam disponíveis na preparação da ação.
- **Confirmar alvo e executar** inicia os cálculos no servidor, sem aprovação do mestre. As rolagens de ataque, dano, salvaguarda e concentração aparecem para o participante responsável.
- Cada jogador responde pelos próprios personagens. O mestre recebe os testes dos NPCs, com ajuste do bônus do bloco de estatísticas. Ele não pode responder aos testes dos jogadores nem encerrar seus turnos.
- O aviso da ação identifica quem precisa responder. Criaturas ocultas usam uma identificação genérica para os jogadores.
- Ataques de oportunidade perguntam ao participante se deseja usar a reação. Recusar libera a sequência de movimento sem gastar a reação.
- **Fim do turno** avança a iniciativa. Fora do próprio turno, os botões desaparecem; o grid e a própria ficha continuam disponíveis. Salvaguardas e reações necessárias continuam abrindo fora do turno.
- A regra antiga que exigia o mestre para encerrar o turno deixa de se aplicar: o participante ativo encerra seu próprio turno.

## Desempenho e regras

A criação da ação, cada resposta e o fim do turno devolvem uma atualização compacta do combate na própria chamada. A interface aplica essa resposta sem aguardar terreno, imagens ou os dados completos da campanha. Eventos em tempo real do combate também usam uma atualização compacta do mapa aberto. Peças e terreno que não mudaram preservam sua identidade, e respostas antigas não substituem uma ação mais recente.

Os dados são gerados e validados no servidor; repetir uma chamada não repete dano ou gasto de recursos. A migração mantém o motor de regras da 037, incluindo custos, alvos, resistências, críticos e concentração. As permissões de leitura do Supabase continuam valendo na atualização compacta.

Efeitos narrativos, efeitos recorrentes que já exigiam aplicação manual e condições especiais sem automação no catálogo continuam dependendo da interpretação do mestre; não foram convertidos em automações completas nesta atualização. Não há aprovação do mestre no fluxo comum de ataque, conjuração ou uso de item.

A atualização foi validada localmente com PostgreSQL via PGlite, compilação de produção e testes de navegador com servidor de teste. Não altera nem publica automaticamente o seu Supabase ou site de produção.
