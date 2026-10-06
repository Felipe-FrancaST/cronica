# Verificação da entrega v16

- `npm test`: **150 testes aprovados**, sem falhas. Inclui regras, geometria, migrações, RLS e operações transacionais em PostgreSQL via PGlite.
- `npm run typecheck`: aprovado.
- `npm run build`: aprovado, com compilação de produção e geração das rotas.
- Navegador sobre o build de produção: **14 fluxos distintos verificados**, cinco de criação/multiclasse/compêndio e nove de regressão da Mesa. A primeira rodada passou 13 de 14; o caso do Compêndio foi repetido após corrigir o seletor do teste para o texto de um título que inclui o marcador de nível, e passou. O ajuste foi no teste.

## Casos novos

- Criar, salvar e reabrir ficha com valores padrão, antecedente, perícias, idiomas, moedas e pacote inicial aplicado uma única vez.
- Compra de 27 pontos e seis rolagens de 4d6 com registro das faces, também no celular.
- Distribuição de níveis, pré-requisitos, caminhos, estilos de luta, escolhas, melhorias de atributos e recuperação de recursos.
- Espaços comuns/Pacto/Arcanos, progressão de aprendizado por classe e atributo de origem da magia.
- PV e Dados de Vida por classe; Ataque Extra e Canalizar Divindade sem somas indevidas.
- Alteração do nível da campanha sem reaplicar melhorias; remoção de pontos e escolhas perdidos ao reduzir níveis.
- Validação transacional de métodos de atributos e escolhas, inclusive tentativa de modificar diretamente atributos gerados pela API.
- Concordância entre cliente e PostgreSQL para Vida, Evocação e Afinidade Elemental Dracônica.
- Magias preservadas, mas indisponíveis, após perder classe, círculo ou concessão do caminho.
- Compêndio com progressões, antecedentes e referência de criação/multiclasse, sem largura excedente na viewport móvel verificada.

## Regressão

Foram verificados imagem do mapa, área de magia, aprovação do mestre, dano/cura e consumo de espaço, ataque com arma e falha, ficha completa de NPC, rolagem após sucesso com resposta atrasada, cura com espaço superior, seletor móvel, criação/arquivo/cópia de sessões e bloqueio de nível das fichas.

Os testes de navegador usam uma API local controlada, sem acessar o Supabase da campanha. Os testes de banco executam todas as 17 migrações e as permissões com usuários de mestre, jogador e terceiro em PostgreSQL via PGlite. Esta entrega não foi publicada no domínio nem aplicada ao banco real do usuário.

As migrações 001–016 foram comparadas byte a byte com o ZIP v15 e permanecem idênticas. `schema.sql` foi regenerado a partir das 17 migrações. O manifesto `arquivos-alterados-v16.json` lista arquivos e hashes em relação à versão anterior. As fontes e limitações das habilidades especiais estão em `fontes-dnd-v16.md` e `multiclasse-e-criacao-v16.md`.

Os registros desta rodada estão em `testes-banco-e-logica-v16.txt`, `typecheck-v16.txt`, `build-producao-v16.txt` e `testes-navegador-producao-v16.txt`.
