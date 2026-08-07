# Política de Segurança

## Versões suportadas

O Limiar OS está em desenvolvimento contínuo. Somente o código presente na
`main` recebe correções de segurança. Commits, branches e builds antigos não são
suportados separadamente.

| Versão | Suporte |
| --- | --- |
| `main` | Sim |
| Outras referências | Não |

## Como relatar uma vulnerabilidade

Não abra uma issue pública para uma vulnerabilidade real ou suspeita. Envie um
[Security Advisory privado](https://github.com/arcanTi/limiar-os/security/advisories/new)
com:

- descrição do problema e do impacto esperado;
- componente, rota ou fluxo afetado;
- passos mínimos de reprodução ou prova de conceito segura;
- versão, commit e ambiente utilizados;
- possíveis mitigações, se conhecidas;
- forma preferida de crédito, caso queira ser mencionado.

Não inclua credenciais reais, dados pessoais ou informações obtidas de sistemas
de terceiros. Faça testes somente em ambientes e dados sob sua autorização.

Os mantenedores procurarão confirmar o recebimento, avaliar severidade e
reprodutibilidade, preparar uma correção e coordenar a divulgação. O tempo de
resposta dependerá do impacto e da complexidade; atualizações serão fornecidas
pelo advisory enquanto a investigação estiver em andamento.

## Escopo

São exemplos de relatos de segurança relevantes:

- falhas de autenticação, sessão ou autorização;
- acesso indevido a campanhas, fichas, mapas ou arquivos;
- injeção, execução de código, XSS ou travessia de diretórios;
- exposição de segredos ou dados privados;
- uploads perigosos ou validação de entrada insuficiente;
- vulnerabilidades exploráveis em dependências ou configuração de deploy.

Erros funcionais sem impacto de segurança, dúvidas de uso e propostas de
balanceamento devem usar os formulários normais de issue.

## Divulgação coordenada

Pedimos que detalhes não sejam publicados antes de uma correção estar disponível
ou de uma data de divulgação ser combinada. O projeto não possui atualmente um
programa de recompensa e não promete pagamento por relatos.
