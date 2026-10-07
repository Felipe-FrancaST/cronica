# Projeto atualizado — Magias, combate e itens v17

Esta entrega contém o projeto completo. Extraia `cronicarpg-magias-combate-e-itens-v17.zip` numa pasta nova e abra `cronicarpg-vtt-v17`, onde está o `package.json`.

## Atualizar a versão que você já usa

1. Pare o servidor antigo, abra a pasta nova e mantenha seu `.env.local` e as variáveis atuais de hospedagem.
2. No SQL Editor do **mesmo projeto Supabase**, execute **somente** `supabase/migrations/202610070018_spell_access_combat_and_items.sql`, uma vez. A criação/multiclasse da v16 (017) já deve estar instalada, como no seu banco atual. Não rode novamente o SQL antigo de multiclasse, a recuperação ou a instalação completa.
3. Execute `npm ci` e `npm run build` com Node.js 22 ou superior. Inicie com `npm run dev`, ou publique pelo procedimento que já usa.
4. Atualize as abas abertas de mestre e jogador para carregarem a mesma versão do site.

O SQL avulso entregue no chat é exatamente o mesmo arquivo que está no ZIP; execute **uma das cópias**. O ZIP inclui apenas a migração nova como arquivo `.sql`. Os dados em `supabase/development-sources.json` servem aos testes e geradores locais.

## Experimentar as alterações

- **Ficha → Magias:** o grimório oferece somente as classes/caminhos que já possuem conjuração. Níveis de multiclasse não liberam magias de círculo maior na lista de outra classe. Segredos Mágicos e Pacto do Tomo têm escolhas próprias e limites.
- **Mesa → Conjurar magia:** escolha a magia e o espaço, toque em **Visualizar área**, aponte o local no Grid e confirme a célula. A borda destacada mostra a área antes de **Enviar ao mestre**.
- **Mesa → Habilidades de classe:** recursos como Fúria, Retomar o Fôlego, Surto de Ação, Ki e Imposição das Mãos acompanham a aprovação e os limites da classe.
- **Ficha → Equipamentos:** adicione e organize itens por tipo. Armas têm proficiência e bônus de ataque; armaduras afetam CA; munição, poções e kits têm quantidades/usos controlados na Mesa.
- **Compêndio:** abra **Itens e equipamentos** e consulte a indicação de aplicação na Mesa em **Habilidades e caminhos**.

Fichas antigas são preservadas. Magias incompatíveis ficam indisponíveis para conjuração; corrija sua origem ou remova a escolha conforme a ficha. Habilidades condicionais, transformações, metamagia e efeitos sem regra automatizada continuam sob decisão do mestre, com essa indicação na interface.

Veja [o guia completo](docs/magias-combate-e-itens-v17.md), [os resultados de validação](docs/validacao-v17.md) e [as fontes das regras](docs/fontes-dnd-v16.md). O download não publica sozinho o site e não executa o SQL no seu Supabase.
