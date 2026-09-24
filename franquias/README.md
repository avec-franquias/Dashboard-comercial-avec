# Dados por franquia

Estrutura de armazenamento compartilhado do Portal.

Cada franquia possui uma pasta por `franquiaId` e os dados sao separados por modulo.
A API `/api/franquia-data?modulo=<id>` exige sessao assinada e sempre usa a franquia do usuario autenticado.

O navegador deixa de ser a fonte oficial dos dados. A migracao dos modulos pode ser feita gradualmente.
