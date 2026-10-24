# Atualização 042 — seleções e magias no grid

## Instalação

1. Com as migrações anteriores até 041 já aplicadas, execute `supabase/migrations/202610240042_spell_scenes.sql` no SQL Editor do Supabase.
2. Publique esta versão do código. Não há novas variáveis de ambiente.
3. O SQL é transacional e reaplicável. Os arquivos 001–041 foram preservados. Não execute `schema.sql` sobre uma instalação existente; ele é o consolidado para instalação nova.

## Seleções e pesquisa

O componente compartilhado de seleção ordena os nomes em português, ignorando diferenças de acento e caixa. Opções numéricas continuam em ordem numérica e a opção vazia de orientação permanece no começo. As listas longas têm uma lupa para abrir a pesquisa. A escolha atual é preservada durante o filtro. Grupos mantêm sua estrutura, com seus nomes e suas opções ordenados.

Raças têm pesquisa direta por nome ou livro, sem precisar digitar acentos. A lista de raças usa ordem global pelo nome. As listas de escolhas de perícias, idiomas e treinamentos também foram ordenadas.

## Catálogo e auditoria

As **361 descrições** do catálogo fornecido possuem um registro de implementação e um SHA-256 para identificar o texto revisado. Consulte `docs/auditoria-magias-grid.md` para a tabela por magia e `docs/auditoria-magias-grid.json` para os detalhes com as descrições completas. No compêndio e nas magias da ficha, a seção **Funcionamento no grid** explica o suporte e as decisões necessárias.

Esta atualização não promete automatizar todo efeito narrativo de D&D. Ilusões, desejos, invocações com escolha de criaturas, condições especiais e exceções continuam exigindo decisão na mesa quando indicado. A tabela diferencia essas situações dos cálculos executados pelo programa.

## Luz, visão e áreas persistentes

- **11 perfis de iluminação**: Luz, Chama Contínua, Globos de Luz, Produzir Chama, Lâmina Flamejante, Esfera Flamejante, Fogo das Fadas, Luz do Dia, Raio Lunar, Escudo de Fogo e Raio de Sol.
- Os raios usam os metros da descrição e são convertidos para a escala do mapa. Luzes ligadas a uma criatura acompanham seu movimento. Globos de Luz representa o grupo/forma combinada em um ponto; a separação de quatro orbes é organizada pelo mestre.
- Produzir Chama permite escolher **iluminar** ou **arremessar**. Iluminar não pede ataque nem causa dano; o ataque encerra a chama ao ser resolvido, inclusive em um erro.
- Fogo das Fadas ilumina as criaturas que falharam na salvaguarda; as que passaram não ganham luz automaticamente.
- Escuridão dissipa luzes mágicas de nível adequado e Luz do Dia dissipa Escuridão de até 3º nível ao se sobreporem. Fome de Hadar mantém sua própria regra de escuridão absoluta. Regiões de escuridão pintadas pelo mestre não têm nível de magia e não são dissipadas automaticamente.
- **61 perfis de área persistente** ficam visíveis em 2D e 3D, com aparência conforme seu tipo. Áreas de fogo têm desenho e volume próprios. Explosões instantâneas, como Bola de Fogo, não deixam automaticamente um incêndio que a descrição não determine.
- Névoa e ocultamento total afetam a máscara de visão; Escuridão respeita a Visão Diabólica. As paredes de fogo têm orientação selecionável.
- Terreno difícil mágico aumenta o custo de movimento enquanto a área existir, sem alterar as células originais do mapa. Encerrar a magia ou perder a concentração remove a sobreposição.
- A duração é acompanhada em rodadas durante combate. Fora dele, o cliente considera o prazo temporal registrado. Os efeitos indefinidos continuam até serem encerrados.

## Gatilhos e movimento

Os gatilhos automáticos abrem decisões para o participante afetado. O jogador responde pelos seus personagens; o mestre responde pelos NPCs. Eles respeitam a CD do conjurador, o modo de dados escolhido para a campanha, resistências, PV temporários, concentração, permissões e proteção contra respostas repetidas.

| Magia             | Gatilhos                                                                   |
| ----------------- | -------------------------------------------------------------------------- |
| Esfera Flamejante | Fim de turno próximo da esfera; colisão ao mover a esfera até uma criatura |
| Névoa Mortal      | Entrada e início do turno na área                                          |
| Nuvem de Adagas   | Entrada e início do turno; sem salvaguarda                                 |
| Nuvem Incendiária | Surgimento, entrada e fim do turno                                         |
| Praga de Insetos  | Surgimento, entrada e início do turno                                      |
| Raio Lunar        | Entrada e início do turno                                                  |

Criar Nuvem de Adagas ou Raio Lunar não cobra dano apenas por a área aparecer. A exposição é registrada por criatura e turno para evitar duplicação. Caminhos que atravessam uma área também são considerados.

O conjurador pode clicar em **Mover** nos efeitos mantidos e escolher o novo ponto no grid:

- Raio Lunar: até 18 m, usando uma ação.
- Esfera Flamejante: até 9 m, usando uma ação bônus.
- Globos de Luz: até 18 m, usando uma ação bônus, dentro de 36 m do conjurador.

Mover não gasta outro espaço de magia. O banco valida o controlador, turno, ação disponível, distância, versão do efeito e decisões pendentes. A resposta respeita as permissões de leitura do grid.

Névoa Mortal avança automaticamente 3 m para longe do conjurador no começo do turno dele. Nuvem Incendiária avança 3 m na direção escolhida ao conjurar. Posições são limitadas à área do mapa. Barreiras verticais, vento e decisões especiais da descrição precisam de conferência do mestre.

## Casos com escolhas do mestre

Muralha de Fogo exige definir o lado quente; o mestre aplica seus gatilhos posteriores sem salvaguarda, incluindo quem termina perto desse lado. O surgimento permite Destreza. Guardiões Espirituais exige indicar criaturas isentas e o tipo de dano. Crescer Espinhos exige considerar a distância efetivamente percorrida. Esses detalhes estão no relatório por magia.

Nos gatilhos manuais, o mestre pode escolher o tipo de dano e registrar o sucesso das salvaguardas por alvo, incluindo evitar todo o dano ou receber metade. Assim, por exemplo, as fases de frio e ácido de Fome de Hadar não precisam ser tratadas como um único tipo de dano. Os gatilhos automáticos ficam separados desse controle para evitar aplicação duplicada pela interface.

## Testes

`npm test`, `npm run typecheck` e `npm run build` verificam as regras, banco local e compilação. `npm run test:spell-scenes` verifica busca/ordenação e a presença/remoção de áreas ao alternar 3D/2D. Os testes não acessam o Supabase de produção.
