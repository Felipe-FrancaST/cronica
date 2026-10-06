# Multiclasse, progressão e criação — v16

## Atualizar

Extraia o ZIP numa pasta nova e mantenha seu `.env.local`. Se a v15 está instalada com as migrações 001–016, execute uma vez `supabase/migrations/202610060017_multiclass_and_character_builds.sql` no SQL Editor do Supabase. Em versões anteriores, execute primeiro as que faltam em ordem. `schema.sql` reúne as 17 migrações para um banco novo; não reexecute a instalação inteira num banco existente.

Execute `npm ci` e `npm run build`. Inicie com `npm run dev` ou publique como já fazia, preservando as variáveis da hospedagem. Atualize a página do mestre/jogadores e reabra fichas antigas.

A migração acrescenta catálogos de progressão/antecedentes e atualiza validações e RPCs da ficha e do combate. Não reescreve fichas existentes nem altera as migrações anteriores. Criação e classes ficam no JSON da ficha, mantendo salvamento transacional, verificação de versões e permissões da campanha.

## Montar a ficha

Em **Personagens → Criar personagem**, preencha a identidade e abra **Criação assistida**.

| Método | Funcionamento |
| --- | --- |
| Valores padrão | Distribua 15, 14, 13, 12, 10 e 8. Trocar a atribuição preserva os seis valores. |
| Compra de pontos | Comece em 8, distribua até 27 pontos, limite 15 antes dos bônus. A interface mostra gasto e saldo. |
| Rolagem | Seis grupos de 4d6, descartando o menor de cada grupo. Distribua os resultados; as quatro faces ficam registradas. |
| Manual | Valores acordados com o mestre, inclusive para preservar atributos de fichas antigas. |

Bônus de origem e melhorias de classe são separados dos valores iniciais. Há um botão para aplicar os bônus das linhagens básicas cadastradas; outras linhagens permitem preencher os bônus do livro da mesa. Em métodos guiados, os atributos finais são calculados e validados no banco. O método manual admite ajustes da mesa.

Escolha as perícias da primeira classe. O antecedente concede perícias, ferramentas/idiomas, uma habilidade narrativa e benefícios de equipamento. Se uma perícia já foi escolhida na classe, substitua a repetição no antecedente.

| Antecedente | Perícias sugeridas | Moedas do pacote |
| --- | --- | --- |
| Acólito | Intuição e Religião | 15 PO |
| Criminoso | Enganação e Furtividade | 15 PO |
| Herói do Povo | Lidar com Animais e Sobrevivência | 10 PO |
| Nobre | História e Persuasão | 25 PO |
| Sábio | Arcanismo e História | 10 PO |
| Soldado | Atletismo e Intimidação | 10 PO |
| Personalizado | Duas perícias escolhidas | Conforme o mestre; sem crédito automático |

O personalizado permite combinar dois idiomas/ferramentas e registrar nome/habilidade. Traços, ideal, vínculo e defeito também ficam salvos. Escolha o pacote inicial e clique em **Aplicar equipamento e moedas**: itens e moedas entram uma única vez. Multiclasse não fornece outro pacote. Depois da aplicação, alterações no patrimônio são feitas em **Equipamentos**.

As rolagens iniciais usam o navegador e guardam as faces. A validação confere formato e soma; esse registro não é uma rolagem assinada pelo servidor. O mestre pode conferir e combinar o método de criação com o grupo.

## Classes e habilidades

Em **Classes e habilidades**, distribua níveis e selecione caminhos disponíveis. O total é a soma dos níveis, de 1 a 20. Proficiência e escala dos truques usam o total; aprendizado, recursos e habilidades usam o nível da classe correspondente.

A classe atual e a nova precisam cumprir os atributos mínimos da multiclasse, normalmente 13. A primeira define salvaguardas e equipamento iniciais; cada classe adicional informa seu treinamento reduzido.

As 12 classes do SRD 5.1 têm progressão até 20 e um caminho do SRD por classe. Há escolhas de estilos de luta, especialização, metamagia, ancestral dracônico, pacto/invocações, inimigo/terreno favorito, opções do Caçador e ambiente da Terra. Cavaleiro Arcano e Trapaceiro Arcano preservam as opções de conjuração anteriores.

Melhorias aparecem no nível da classe: distribua +2 em um atributo ou +1 em dois. Salvar/reabrir não reaplica pontos. O limite comum é 20; o recurso do bárbaro 20 é tratado separadamente. Talentos opcionais e escolhas de suplementos podem ser registrados com o mestre nos campos de habilidades/anotações.

**Usos e pontos de habilidades** mostra Fúria, Inspiração Bárdica, Ki, Pontos de Feitiçaria, Retomar o Fôlego, Surto de Ação, Canalizar Divindade, Cura pelas Mãos e outros recursos disponíveis. Registre o gasto e salve. Descansos recuperam recursos elegíveis. Ataque Extra usa o maior número concedido; Canalizar Divindade compartilha a reserva.

As descrições explicam ações, limites e condições. Transformação, Fúria, conversão de pontos em espaços, Metamagia e efeitos narrativos são resolvidos com o mestre na Mesa; registrar usos não executa sozinho todos esses efeitos. Dados de Vida são separados por classe. PV calculados usam o primeiro dado máximo e médias fixas nos outros níveis; PV rolados podem ser informados no máximo manual.

## Grimório e combate

Selecione **Classe do grimório** em **Magias**. Cada magia tem uma classe de origem para atributo, ataque, CD e aprendizado. Um paladino 3/mago 2 tem espaços de 2º círculo pela combinação e pode elevar uma magia aprendida; isso não libera aprender magias de 2º círculo como mago 2.

Espaços comuns combinam Conjuração. Pacto e Arcanos Místicos do bruxo mantêm reservas próprias. Pacto recupera em descanso curto ou longo; espaços comuns, em descanso longo. Ambas as reservas podem conjurar magias conhecidas/preparadas das classes quando o círculo permite.

**Adicionar magias concedidas pelo caminho** inclui Vida, Devoção e Terra disponíveis no nível/ambiente. Ficam sempre preparadas. Se perder classe, nível ou caminho, a magia permanece para consulta e sua conjuração fica indisponível. Outras concessões especiais podem ser registradas como extras conforme a mesa.

Na Mesa, pedidos ao mestre e rolagens após aprovação usam o atributo da origem. As fórmulas incluem Discípulo da Vida (+2 + círculo usado), Evocação Potencializada (mago 10) e Afinidade Elemental Dracônica (feiticeiro 6, tipo correspondente ao ancestral). Outros efeitos especiais dependem da aplicação pelo mestre, incluindo alvos, resistências e condições.

## Nível da campanha

Com **Mestre controla o nível de todos**, o jogador pode redistribuir níveis mantendo o total da campanha. Adicionar multiclasse transfere um nível existente. Interface e banco rejeitam totais diferentes.

Quando o mestre altera o nível, a distribuição se ajusta, preservando classes quando possível. Melhorias e escolhas indisponíveis são removidas; atributos e limites acompanham a mudança. Magias permanecem para consulta. Reabra fichas antigas após mudar as regras para trabalhar com a versão atual.

## Compêndio e suplementos

Consulte **Habilidades e caminhos**, **Antecedentes** e **Criação e multiclasse** no Compêndio. As novas áreas mostram níveis, caminhos, escolhas, pontos, pré-requisitos e regras de espaços.

A base é D&D 5e de 2014 / SRD 5.1. O Artífice conserva classe, multiclasse e conjuração, mas especialidades/habilidades de suplementos são registradas manualmente. O catálogo não representa todas as subclasses de todos os livros. Livros específicos podem orientar uma expansão futura. Veja [fontes e escopo](fontes-dnd-v16.md).
