# Atualização 040 — vida, combate e mapas

Execute `supabase/migrations/202610240040_life_and_map_library.sql` no Supabase **depois da 039**. Depois publique o código deste pacote. Não reaplique migrações anteriores nem execute `supabase/schema.sql` em uma instalação existente.

## Personagens com 0 PV

O personagem fica Caído e Inconsciente, com indicação no grid 2D e 3D. No início do turno, abre a salvaguarda contra a morte para o jogador que o controla. O mestre não responde pelos personagens dos jogadores. O teste pendente impede avançar o turno.

O teste usa d20 e CD 10, sem atributo ou proficiência: 10 ou mais dá um sucesso; abaixo de 10 dá uma falha; 1 natural dá duas falhas; 20 natural recupera 1 PV. Três sucessos estabilizam e zeram as contagens; três falhas causam a morte. Dados físicos/virtuais seguem as regras da campanha.

Dano enquanto está a 0 PV causa falhas; um crítico causa duas. São considerados dano maciço, PV temporários e cada acerto de uma sequência na ordem. Dano tira a estabilidade. Recuperar PV cancela o teste pendente, remove a inconsciência de 0 PV e zera as contagens. Cura comum não ressuscita mortos. O personagem permanece caído: use Levantar no seu turno, gastando metade do deslocamento.

O painel mostra o estado e as contagens do próprio personagem. As respostas compactas atualizam esse estado sem esperar o recarregamento completo. Resumos de outros participantes não revelam seus PV nem contagens privadas.

NPCs mantêm o tratamento anterior sob controle do mestre. Recuperação em 1d4 horas de criaturas estáveis, ressurreição, características que alteram a queda a 0 PV e bônus especiais não modelados exigem acompanhamento do mestre. Não há relógio de horas fora do combate.

## Animações

Golpes próximos usam cortes; ataques à distância usam projéteis; magias usam esferas, raios, selos ou pulsos de cura. Cores variam conforme o tipo de dano, com indicação de erro e crítico. Áreas de esfera, cone, linha e cubo são projetadas no grid respeitando a escala e as áreas ocultas.

Os efeitos são cosméticos, duram menos de um segundo, usam até seis alvos e 24 vértices e não criam outro contexto 3D ou loop de renderização permanente. Respeitam Regras e movimento reduzido. Para quem está rolando, aguardam fechar a janela de resultado; os demais participantes os veem ao resolver a ação. Não atrasam a aplicação do dano nem a próxima ação.

## Oficina

São 68 símbolos e 24 tokens, incluindo as 12 classes com silhuetas próprias e criaturas distintas. A biblioteca ganhou cachoeira, juncos, cogumelos, geleira, dunas, forte, taverna, ferraria, mercado, prisão, cabana, cais, círculo de pedras, estátua, barricada, barril, caixote, mesa, cama, estante e tocha. Santuário, naufrágio e armadilha têm desenhos distintos dos símbolos semelhantes.

Pesquise tokens e símbolos; a categoria Móveis e objetos reúne interiores. Defina a rotação das novas peças antes de colocar ou pintar. Novas peças recebem nomes correspondentes. Cor, facção, número, tamanho, posição, camadas, bloqueio e visibilidade continuam editáveis. Os mesmos desenhos são usados na prévia, no mapa e no PNG exportado.

Mapas antigos são compatíveis. Servidor e importação/exportação JSON aceitam os novos identificadores com validação estrita e as permissões existentes.

Referência: [D&D Basic Rules 2014 — Combat](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/combat).
