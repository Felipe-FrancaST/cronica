# Exportação da ficha D&D 5e em PDF

## Atualizar o site

1. Substitua o código pela pasta `rpg-cronica` deste pacote, preservando seu `.env.local`.
2. Execute `npm ci` e `npm run build` e faça novo deploy pelo processo habitual.
3. Recarregue o site. Esta funcionalidade não precisa de SQL novo. A versão do banco continua sendo a **035**; em bancos mais antigos, complete somente as migrações ausentes.

O modelo PDF e a fonte estão incluídos no projeto. Nenhuma variável de ambiente ou serviço externo de geração de PDF é necessário.

## Como usar

Abra **Personagens → Abrir ficha → Exportar PDF**. Para um personagem novo, salve a ficha primeiro e depois abra-a novamente. O botão também fica disponível na ficha aberta pela Mesa e para jogadores com permissão somente de consulta.

A exportação usa os dados exibidos no momento do clique, inclusive alterações ainda não salvas. Ela não grava essas alterações no site. Uma mensagem indica quando o arquivo foi gerado ou quando é necessário tentar novamente.

Em **História**, preencha os novos campos opcionais de idade, altura, peso, olhos, pele, cabelo, outras proficiências, aliados, organização e tesouros. **Combate** também ganhou o controle de inspiração. Os novos dados usam o armazenamento já existente da ficha. Campos não informados ficam em branco; o sistema não tenta extrair idade ou características físicas a partir de texto livre.

## Conteúdo do arquivo

- As três páginas originais do modelo enviado: identidade, atributos e modificadores, salvaguardas, perícias, combate, equipamentos, moedas, personalidade, história e conjuração.
- Proficiências e especializações calculadas pelo sistema; os círculos do modelo indicam proficiência e as especializações ficam identificadas nas páginas adicionais.
- Dados de vida por classe, condições, recursos e usos de habilidades, escolhas de progressão e detalhes de criação dos atributos.
- Inventário completo com notas, sintonização, cargas, bônus e funções dos itens. Tesouros do inventário também aparecem na área de tesouros.
- Magias com classe de origem, preparação, círculos, espaços usados, descrições e anotações. As CDs e os ataques de cada classe são mantidos separados em multiclasse; Magia de Pacto e Arcanos Místicos têm suas próprias reservas.
- Retrato, quando disponível. Uma imagem escolhida na ficha pode entrar no PDF sem ser enviada ao servidor. Se o retrato estiver indisponível, o PDF é gerado com um aviso.

Textos longos e listas que excedem o modelo ganham páginas adicionais identificadas. Os textos dessas páginas também são editáveis. Os campos numéricos não recebem valores deduzidos de anotações livres; ataques usam os cálculos normais da Mesa, sem ativar efeitos opcionais de combate.

O PDF mantém campos editáveis e pode ser aberto, impresso e preenchido em um leitor compatível. Alguns visualizadores de celular não permitem editar formulários. Símbolos sem glifo na fonte são mostrados pelo código Unicode na aparência impressa, preservando o texto original nos valores dos campos.

## Implementação e validação

O modelo fornecido está em `public/character-sheet/dnd5e-editable-v1.pdf`, com arte e avisos originais preservados. O mapeamento fica em `src/systems/dnd5e/pdf/template.ts`. A fonte incorporada e sua licença acompanham os arquivos públicos. Ao trocar o modelo, atualize também o mapeamento e os testes.

A biblioteca de PDF e o modelo são carregados somente ao exportar. A geração roda em um Web Worker para manter a interface disponível. O arquivo é produzido no navegador, usando apenas a ficha acessível ao usuário, e não é armazenado no servidor.

Validação automatizada:

```bash
node --import tsx --test tests/character-pdf.test.ts
npm run test:character-pdf
npm run typecheck
npm run build
```

Os testes verificam os campos do modelo, ordem das perícias e moedas, multiclasse, preparação e espaços de magia, funções dos itens, valores e aparências dos formulários, conteúdo extenso, persistência dos novos campos e download real em navegador com sessão de jogador, inclusive consulta no celular e recuperação de erro de carregamento.
