# NPCs, condições e visão no combate

Atualização baseada nas regras de D&D 5e de 2014, preservando as atualizações anteriores.

## Instalação

Depois da migração 042, execute `supabase/migrations/202610240043_npcs_conditions_and_vision.sql` no SQL Editor do Supabase. Em seguida, publique o código deste pacote. Não é necessário alterar variáveis de ambiente. Não execute novamente migrações antigas.

## Ficha de NPC

Retrato clicável com ajuste de imagem, nome em destaque, resumo e navegação entre etapas. Acrescenta tipo de criatura, tamanho aplicado à ocupação no grid, alinhamento, ND, proficiência opcional, bônus totais de salvaguardas e perícias, deslocamentos, sentidos em metros, idiomas e imunidades. Os campos de um bloco de estatísticas são independentes das restrições de criação de um personagem jogador. Ataques e magias ficam recolhidos; a ficha aceita NPCs sem classe.

## Controles no grid

O jogador mantém o resumo da própria vida, CA e acesso à ficha fora do turno, inclusive em tela cheia. As ações continuam disponíveis no seu turno. Um botão recolhido permite consultar as próprias condições e suas regras.

Um toque curto numa criatura abre os controles do mestre. Arrastar continua sendo movimento. O mestre pode aplicar cura, dano com tipo, PV temporários e as quinze condições, consultar a regra e remover condições. Comandos repetidos após uma falha de rede usam identificação para evitar aplicação duplicada. Jogadores não recebem os PV privados de outras criaturas.

## Condições de 2014

Deslocamento, vantagens/desvantagens de combate, falhas automáticas de Força/Destreza, críticos a até 1,5 m e concentração consideram as condições. Incapacitado sozinho não impede caminhar. Ações interrompidas por incapacidade são encerradas sem bloquear o turno; antes da primeira rolagem, os recursos são preservados. A exaustão usa seis níveis cumulativos; no quarto reduz os PV máximos, no quinto impede movimento e no sexto causa morte. Um descanso longo confirmado com alimentação e água remove um nível. Petrificação concede resistência a dano e imunidade a novos envenenamentos. Os bônus de salvaguarda do NPC são usados nos testes.

Medo e encantamento permitem indicar a criatura de origem. O medo impede aproximação voluntária e prejudica ataques enquanto a fonte está visível; encantamento impede atacar ou causar efeitos nocivos contra a fonte. Sem uma fonte no grid, o mestre acompanha essas restrições na narrativa. Um agarrão com fonte termina quando ela fica incapacitada ou perde alcance. Condições não criam CD ou teste de escape que não exista na sua fonte: o mestre deve usar os testes apropriados à habilidade ou ao agarrão.

Aspectos narrativos como falar, testes sociais, largar objetos e determinar se um teste depende de visão/audição continuam exigindo julgamento do mestre. Um resumo dos efeitos da regra fica disponível junto à condição.

## Magias narrativas

No painel de combate do mestre, use **Ler descrição / manter efeito** nas magias narrativas utilizadas ou nos efeitos ativos. É possível consultar a descrição, escolher o formato e a aparência de uma marcação e colocá-la no grid. O marcador permanece até o efeito terminar ou o mestre encerrá-lo. Não consome a ação ou o espaço novamente, não duplica o efeito e não reinicia a duração. Uma ilusão marcada não se transforma automaticamente em uma barreira física ou área de dano.

## Visão

Ative **Visão dos personagens** nos controles do mapa. Luz intensa permite ver normalmente; penumbra permite ver com percepção visual prejudicada; visão no escuro transforma penumbra em luz intensa e escuridão comum em penumbra em tons de cinza. A distância é convertida conforme a escala em metros ou pés. Não existe um limite artificial de visão de 60 m para enxergar uma área iluminada distante.

Paredes e portas fechadas bloqueiam visão também durante o dia. Escuridão comum não bloqueia a linha até um foco de luz distante. Escuridão mágica exige um sentido que a atravesse ou luz mágica capaz de iluminá-la. Névoa opaca e a escuridão especial de Fome de Hadar não são atravessadas por visão no escuro, visão diabólica ou visão verdadeira; percepção às cegas funciona no seu alcance sem revelar áreas escondidas pelo mestre. Cego e Inconsciente afetam a percepção. Visão verdadeira não cura cegueira.

Visão no Escuro, Visão da Verdade, Ver o Invisível, Invisibilidade, Invisibilidade Maior, Fogo das Fadas e magias de luz são considerados. O catálogo mantém as 361 magias. O alcance de Escuridão foi corrigido de 36 m para 18 m, conforme a regra de 2014. Ver o Invisível não ilumina o escuro. Invisibilidade comum acaba ao atacar ou conjurar; a maior não. Fogo das Fadas revela seus alvos e remove os benefícios da invisibilidade conforme sua regra.

As vantagens/desvantagens independentes da condição Invisível seguem a redação de 2014. O mestre pode ajustar modos de rolagem nas decisões quando a mesa usa uma interpretação diferente. O sistema não transforma percepção de criaturas em leitura automática de ilusões, identidades ou segredos.

Referências: [condições de 2014](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/appendix-a-conditions), [visão e luz](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/adventuring), [sentidos das criaturas](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/monsters), [magias](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/spells).
