# Correção da troca 3D / 2D

Publique o código deste pacote. **Esta correção não exige executar SQL.** As migrações até a 040 foram preservadas.

A borda interna dos tokens no canvas 2D usava um recuo fixo de cinco pixels. Em telas pequenas, mapas grandes ou tokens pequenos, o enquadramento diminuía o raio visível do token para menos de cinco pixels. A subtração gerava um raio negativo, e a API nativa Canvas lançava `IndexSizeError`, interrompendo a página.

O recuo agora respeita uma proporção máxima do raio do token. A espessura da borda também é limitada. O token permanece desenhado corretamente no zoom mínimo, sem alterar turno, posições, dados do personagem ou combate.

O teste de regressão cobre a troca repetida entre 3D e 2D durante um combate ativo, mapas de 100 × 100, tokens pequenos, zoom mínimo e telas de 375 × 667 e 1440 × 1000. Ele verifica erros reais do navegador, os raios enviados ao canvas e a preservação do turno e das posições.

Teste: `npm run test:canvas-switch`.
