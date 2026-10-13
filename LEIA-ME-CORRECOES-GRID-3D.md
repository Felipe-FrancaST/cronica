# Correções do Grid 3D

## Instabilidade visual

- A câmera ajusta os planos de profundidade aos limites do cenário. Isso melhora a precisão dos pisos e detalhes finos ao aproximar e afastar a visão.
- As linhas da grade e os contornos das áreas de magia deixam de escrever profundidade sobre outros elementos.
- A seleção e a troca de turno reutilizam a miniatura e o retrato. Antes, esses eventos descartavam o grupo inteiro e carregavam a imagem novamente.
- Renovar o link temporário de uma imagem já carregada mantém o mapa e o retrato na tela.
- O anel de seleção acompanha o tamanho do personagem uma única vez. Um personagem de duas células agora recebe um anel de duas células, em vez de quatro.
- As luzes mantêm suas posições na reserva durante pequenos movimentos da câmera. A troca de fontes usa transição gradual; a quantidade de luzes nos shaders permanece estável.
- As chamas recebem margem de visibilidade para a deformação animada e deixam de lançar sombras estáticas incompatíveis com essa deformação.

## Desempenho e interação

- Ao remover ou trocar um cenário, os buffers próprios das instâncias também são liberados, além das geometrias, materiais e texturas compartilhadas.
- Atualizações repetidas do mesmo destino deixam de reiniciar a animação de movimento.
- Alterar a preferência de movimento reduzido atualiza a navegação e encerra as animações em andamento.
- Alterar a grade ou a imagem do mapa mantém o modo de iluminação escolhido para a cena.
- O campo de luz só recria sua textura quando suas fontes ou configurações mudam.
- Os testes de banco executam com duas tarefas simultâneas, limitando o consumo de recursos.

## Outros erros corrigidos

- Removido o import não usado que impedia a checagem TypeScript.
- Incluídas as migrações SQL 019–021, ausentes do arquivo recebido. As regras agora possuem rolagens de PV persistentes, validação no servidor e preservação de inventários existentes.
- O avanço do nível definido pelo mestre registra os novos dados de PV antes de atualizar fichas que usam rolagem. Diminuir o nível preserva os resultados já registrados.
- A criação de cenários valida o conjunto inteiro em uma transação e reutiliza o mesmo mapa quando uma solicitação é repetida.
- Luzes, alturas, estilos e permissões de exclusão de capítulos são validados no banco.
- O export `supabase/schema.sql` foi regenerado com todas as 23 migrações.
- Corrigida a compatibilidade das migrações com funções que já possuem parâmetros padrão (`42P13`). A atualização preserva a assinatura instalada e as dependências da função.
- Corrigida a reaplicação da migração 023 quando suas restrições já existem.

## Validação

Resultado: 244 testes automatizados passaram; oito cenários de navegador foram aprovados; a checagem TypeScript e o build de produção foram concluídos.

- Checagem TypeScript e compilação de produção.
- Testes de regras, banco PostgreSQL local, permissões, movimento, visão e geometria.
- Regressões para reutilização de retratos e mapas, tamanho do anel, continuidade do movimento, liberação de buffers e estabilidade das luzes.
- Testes de navegador para imagem do mapa, edição do cenário, seleção de água, fogo, catálogo de elementos, dia/noite e cidade em 3D/2D.
- O novo teste de renderização compara dois quadros de um cenário estático com 24 lanternas e confirma que girar e aproximar a câmera reutiliza os programas de shaders.

Os testes usam dados locais de demonstração e não acessam a campanha em produção. Veja [as instruções de atualização](LEIA-ME-ATUALIZACAO.md) para aplicar o pacote.
