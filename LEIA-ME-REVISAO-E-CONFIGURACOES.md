# Revisão do projeto e configurações — 033

Esta revisão concentra as alterações em problemas encontrados na sincronização, no perfil, nas imagens e na administração. A validação percorre o projeto com TypeScript, testes de regras e banco, testes de navegador e build de produção. Isso não equivale a verificar manualmente cada possibilidade de campanha ou cada estado do Mercado Pago.

## O que mudou

- As atualizações do espaço de trabalho e da situação da assinatura são agrupadas. Durante uma consulta há no máximo uma consulta seguinte pendente. Resultados superados não substituem a versão mais recente. Respostas de uma sessão encerrada não preenchem a conta seguinte.
- Voltar para a aba ou recuperar a conexão atualiza os dados. Rajadas de eventos deixam de disparar várias consultas completas simultâneas.
- Uma gravação confirmada continua concluída se a leitura posterior falhar. O aviso de carregamento permite consultar novamente, sem repetir a criação do registro.
- Salvar o nome ou avatar não altera as preferências. A nova rotina de preferências mescla somente as opções enviadas, valida os valores e usa a identidade autenticada, sem receber um ID de usuário como alvo.
- O menu Configurações reúne preferências, perfil, senha, assinatura, troca de modo e exclusão de conta. Continua acessível para quem precisa regularizar a assinatura.
- A administração ignora respostas antigas quando filtros ou abas mudam. Operações têm bloqueio imediato contra repetição; os campos de configuração ficam bloqueados durante o envio. Um resumo mostra a exigência de assinatura para mestres e jogadores e o efeito da manutenção. Links de termos e privacidade exigem HTTPS.
- Imagens vazias, URLs de outros domínios disfarçadas de caminhos locais e dados de imagem incompatíveis são recusados. A troca de caminho de uma imagem não mantém a imagem anterior enquanto a próxima é resolvida.

## Preferências que funcionam

| Opção                                | Resultado                                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Texto padrão ou ampliado             | Ajusta texto e controles que acompanham a escala da interface.                                                                                                     |
| Movimento do dispositivo ou reduzido | Reduz transições da interface, animações dos dados, movimento de peças e luzes animadas do 3D. A opção de acessibilidade do dispositivo continua sendo respeitada. |
| Cards compactos                      | Oculta descrições na lista de campanhas.                                                                                                                           |
| Mapa inicial 2D ou 3D                | Define a visualização ao abrir a mesa.                                                                                                                             |
| 3D equilibrado ou leve               | Ajusta resolução e sombras. As permissões e regras de visão permanecem aplicadas pelo jogo.                                                                        |
| Animação dos dados                   | Controla a animação sem remover resultados ou histórico.                                                                                                           |

Use **Salvar preferências** para aplicar. **Restaurar padrões** prepara os valores; confirme com Salvar para gravar. O mestre e os jogadores mantêm preferências próprias.

Os controles rápidos da mesa continuam disponíveis e lembram os ajustes por conta neste navegador. Salvar as preferências pessoais limpa esses ajustes locais, reaplicando os padrões da conta. Chaves locais antigas, que eram compartilhadas por todas as contas do navegador, deixam de definir o mapa e os dados.

## Atualizar

1. Se o banco já está na **032**, execute **somente** `supabase/migrations/202610210033_profile_preferences.sql` no SQL Editor do Supabase. Se ainda está na 031, execute primeiro a 032; em bancos anteriores, complete todas as migrações ausentes em ordem.
2. Substitua o código pelo conteúdo deste pacote, preservando seu `.env.local` e as variáveis de hospedagem.
3. Execute `npm ci` e `npm run build`; publique pelo processo que já utiliza.
4. Recarregue as abas. Abra Configurações, escolha as preferências e salve.

A migração 033 não redefine preferências existentes e pode ser reaplicada. As 001–032 permanecem intactas. Não execute `supabase/schema.sql` em um banco existente: esse export completo é exclusivo para instalações novas. Se o código for publicado antes da 033, o salvamento de preferências explica qual atualização está faltando.

## Verificação

Resultados desta revisão: **391 testes automatizados aprovados**, verificação de tipos, formatação e **build de produção aprovados**. Foram conferidos **32 cenários distintos de navegador**: 18 de assinatura, Pix e exclusão de conta; seis de configurações e oito do grid. As telas de configurações foram inspecionadas no computador e no celular, inclusive com texto ampliado.

Um cenário de seleção de objetos em 3D precisou de repetição isolada após um timeout e passou nessa execução.

Comandos de validação:

```bash
npm run typecheck
node --import tsx --test --test-concurrency=1 tests/*.test.ts
npm run format:check
npm run build
npm run test:settings
npm run test:grid-preferences
npm run test:billing
npm run test:pix
npm run test:account
```

Os testes de navegador usam serviços locais e identidades fictícias. A confirmação real de pagamento depende das credenciais, notificações e ambiente da sua aplicação Mercado Pago. Esta revisão não publica o site nem faz cobranças reais.
