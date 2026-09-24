# Cadastro de Franquias

Objetivo: manter usuarios atuais e apenas vincula-los a uma franquia.

Estrutura desejada:
- franquia: id, nome, ativo
- usuarios vinculados: login, perfil (franqueado/funcionario), modulos
- dados operacionais salvos por franquiaId

Fluxo administrativo:
1. Criar uma franquia.
2. Selecionar usuarios ja existentes.
3. Definir perfil de cada usuario.
4. Definir modulos liberados.
5. Dados de ativacao/clientes/propostas passam a ser compartilhados entre usuarios da mesma franquia.
