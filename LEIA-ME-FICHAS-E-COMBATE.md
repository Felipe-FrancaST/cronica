# Fichas e combate guiado · atualização 037

Esta atualização usa D&D 5e de 2014. A ficha distingue escolhas da classe, concessões da especialização e exceções aprovadas pelo mestre.

## Como atualizar

1. Atualize os arquivos do projeto com este pacote.
2. Se o banco já está na migração 036, execute **somente** `supabase/migrations/202610230037_sheet_rules_and_guided_combat.sql` no SQL Editor do Supabase. Execute o arquivo inteiro. Ele é transacional, pode ser reaplicado e tem menos de 256 KiB.
3. Faça o build e publique o código atualizado. Atualize as páginas abertas dos participantes.

Para uma instalação nova, siga as migrações 001–037 em ordem ou o `supabase/schema.sql` completo. O schema completo é para instalações novas.

## Ficha do jogador

- Os botões no rodapé passam para a próxima seção ou voltam à anterior, retornam ao topo e colocam o foco na aba aberta. A navegação também funciona pelo teclado e no celular.
- Proficiência soma o bônus uma vez; especialização soma duas vezes. Treinamentos de diferentes origens não se acumulam. A especialização exige proficiência prévia.
- As salvaguardas vêm da classe inicial. Multiclasse não concede as salvaguardas da segunda classe. O cálculo inclui as habilidades de alto nível de ladino e monge e a aura do próprio paladino.
- Perícias de classe, antecedente, escolhas de habilidades e concessões raciais implementadas entram no cálculo. O meio-elfo escolhe duas perícias na criação assistida; elfos do Livro do Jogador e meio-orcs recebem seus treinamentos fixos.
- O jogador faz essas escolhas nas abas de criação e habilidades. Campos de exceção manual ficam com o mestre. Exceções antigas são preservadas, e escolhas de criação deixam de ser copiadas permanentemente para os campos manuais.
- Truques e magias conhecidas seguem a tabela de cada classe. Preparadas respeitam atributo e nível da classe; concessões válidas da especialização são adicionais. Marcar uma magia genericamente como “extra” não aumenta esses limites.
- Cavaleiro Arcano e Trapaceiro Arcano respeitam suas escolas e escolhas livres. Mãos Mágicas ocupa uma das escolhas de truque do Trapaceiro Arcano.
- O mago começa com seis magias no grimório e ganha duas por nível de mago. Cópias encontradas na aventura podem ampliar o grimório; a lista preparada continua limitada. Espaços de multiclasse e espaços de pacto são reservas separadas.

O banco valida os limites relevantes ao salvar, inclusive quando os atributos ou a classe mudam. Fichas antigas podem precisar ajustar escolhas excedentes antes de serem salvas; os registros não são apagados automaticamente.

## Como usar o combate guiado

1. O jogador escolhe arma, magia, habilidade ou função de item, confere o recurso e aponta os alvos ou a área.
2. O mestre confere cobertura, visibilidade, condições e particularidades da descrição e escolhe **Resolver pelas regras**.
3. A janela de ataque aparece para o atacante. O servidor calcula o bônus, compara com a CA e determina o acerto e o crítico.
4. Salvaguardas aparecem para quem controla cada criatura atingida, inclusive fora de seu turno. O mestre responde pelos NPCs e pode ajustar vantagem, desvantagem e o bônus total dos NPCs na lista de pendências.
5. O atacante rola o dano ou a cura. O servidor registra a rolagem, aplica o resultado e gasta os recursos uma única vez. A janela mostra os resultados por alvo.
6. Se houver dano em uma criatura concentrada, ela recebe o teste de Constituição. Uma falha encerra a concentração. Raios que causam danos separados geram testes separados; os demais testes deixam de ser necessários quando a concentração termina.

O aviso no alto informa de quem é o turno, a rodada e os recursos do participante controlado. Fechar uma janela com **Ver depois** mantém a pendência disponível no aviso. O turno não avança enquanto houver decisões guiadas pendentes.

Rajada Mística e Raio Ardente permitem definir um alvo para cada raio e calculam ataques, críticos e danos separadamente. Acertos críticos dobram os dados, preservando os modificadores. Salvaguardas não têm sucesso ou falha automáticos por um 20 ou 1 natural.

Trocar uma magia de concentração pede confirmação. Cancelar antes de começar preserva a concentração anterior. Depois de aceitar a troca, a concentração anterior termina. Quando ataques ou salvaguardas já começaram, o jogador conclui a sequência; o mestre pode encerrá-la mantendo os gastos aplicáveis. Se a ficha ou o item de origem tiver sido alterado durante uma tentativa, o cancelamento pelo mestre continua disponível e pede conferência manual dos gastos. Errar um ataque no modo guiado gasta a ação e a munição, e preserva recursos que só são usados em um acerto, como o espaço da Destruição Divina selecionada.

## Itens e magias

Funções de itens podem ter uma CD fixa de salvaguarda ou exigir uma jogada de ataque. É possível definir um bônus fixo de ataque; em branco, um item de ataque usa Destreza sem proficiência, como arma improvisada. Cargas e quantidades são validadas no servidor. Ácido e água benta usam jogada de ataque; o mestre confirma se a criatura pode ser afetada.

Foram completados perfis numéricos de magias comuns que estavam apenas como utilidade, incluindo Raio Guiado, Arma Espiritual, Faísca da Bruxa, Nuvem de Adagas, Raio Lunar, Esquentar Metais, Convocar Relâmpagos, Praga de Insetos e Nuvem Incendiária. Arma Espiritual aumenta o dano a cada dois círculos acima do 2º. Nuvem de Adagas e Raio Lunar mantêm o dano nos gatilhos da descrição, em vez de causar dano apenas por serem criadas.

## Decisões do mestre

A automação numérica não substitui a descrição da magia. Condições especiais, deslocamentos forçados, cobertura, reações como Escudo e Contramágica, invocações, efeitos narrativos e alterações do cenário continuam sob decisão do mestre. Efeitos persistentes aparecem no painel de áreas: o mestre acompanha a duração e usa **Aplicar efeito** no gatilho correto, confirmando ataques e salvaguardas necessários.

Se o mestre alterar a fórmula, a área ou definir um resultado manual, use **Decisão manual do mestre**. O modo guiado utiliza o perfil e os cálculos canônicos; ele avisa quando uma personalização precisa de adjudicação manual.

## Verificação técnica

- `npm run typecheck`
- `node --import tsx --test --test-concurrency=1 tests/*.test.ts`
- `npm run build`
- `npm run test:guided-combat` para os fluxos de navegador com o backend local de testes.

Os testes de PostgreSQL cobrem permissões, limites da ficha, sincronização dos 361 perfis, acertos e críticos, áreas, Evasão, concentração, cargas de itens e repetição de requisições. Os testes de navegador cobrem a navegação da ficha e as janelas que chegam ao participante correto. Os dados financeiros e de produção não são usados nesses testes.

Referências de regras: [classes de 2014](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/classes), [combate](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/combat), [conjuração](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/spellcasting) e [magias](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/spells).
