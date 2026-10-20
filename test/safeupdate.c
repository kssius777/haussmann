/*
 * Comme chez Supabase (extension pg-safeupdate, chargée pour toutes les requêtes du site et de Vercel) :
 * un DELETE ou un UPDATE sans WHERE est refusé, même dans une fonction ou une migration.
 * Sur la vraie base, « delete from metro_stop; » a ainsi fait échouer le déploiement du 20/10/2026.
 * Construit et chargé par test/up.sh sur la base de test (session_preload_libraries).
 */
#include "postgres.h"
#include "fmgr.h"
#include "parser/analyze.h"
#include "nodes/parsenodes.h"
#include "utils/guc.h"

PG_MODULE_MAGIC;

void _PG_init(void);

static post_parse_analyze_hook_type prev_hook = NULL;
static bool enabled = true;

static void
check_query(Query *query)
{
	ListCell   *l;

	if ((query->commandType == CMD_DELETE || query->commandType == CMD_UPDATE) &&
		query->jointree != NULL && query->jointree->quals == NULL)
		ereport(ERROR,
				(errcode(ERRCODE_CARDINALITY_VIOLATION),
				 errmsg("%s requires a WHERE clause",
						query->commandType == CMD_DELETE ? "DELETE" : "UPDATE")));
	foreach(l, query->cteList)
	{
		CommonTableExpr *cte = (CommonTableExpr *) lfirst(l);

		if (cte->ctequery && IsA(cte->ctequery, Query))
			check_query((Query *) cte->ctequery);
	}
}

static void
hook(ParseState *pstate, Query *query, JumbleState *jstate)
{
	if (enabled)
		check_query(query);
	if (prev_hook)
		prev_hook(pstate, query, jstate);
}

void
_PG_init(void)
{
	DefineCustomBoolVariable("safeupdate.enabled", "Refuse DELETE and UPDATE without WHERE", NULL,
							 &enabled, true, PGC_USERSET, 0, NULL, NULL, NULL);
	prev_hook = post_parse_analyze_hook;
	post_parse_analyze_hook = hook;
}
