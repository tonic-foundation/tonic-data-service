-- should run this script starting with an empty table because this doesn't
-- handle conflicts
--
-- NB: due to how the leaderboard is created, you need to run refresh-leaderboard.sql
-- after this

begin;

-- add eligible markets
insert into competition.eligible_market (race, market_id, one_quote)
select
    'usdc',
    id,
    1000000::numeric
from market
where
    quote_token_id = 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near'
    -- exclude usn/usdc, which is a stable market
    and symbol not like 'usn%';

-- add usn/usdc as a stable market
insert into competition.eligible_market (race, market_id, one_quote)
select
    'stable',
    id,
    1000000::numeric
from market
where
    symbol = 'usn/usdc';

-- add stnear/near as a stable market
insert into competition.eligible_market (race, market_id, one_quote)
select
    'stable',
    id,
    1000000000000000000000000::numeric
from market
where
    symbol = 'stnear/near';

-- exclude our market makers
insert into competition.excluded_account values ('soyjack.near');
insert into competition.excluded_account values ('mmstnear.near');
insert into competition.excluded_account values ('mmaurora.near');
insert into competition.excluded_account values ('mmusn.near');
insert into competition.excluded_account values ('lojack.near');
insert into competition.excluded_account values ('tng01.near');
insert into competition.excluded_account values ('tng02.near');
insert into competition.excluded_account values ('tng03.near');
insert into competition.excluded_account values ('tng04.near');
insert into competition.excluded_account values ('tng05.near');
insert into competition.excluded_account values ('tng06.near');
insert into competition.excluded_account values ('tng07.near');
insert into competition.excluded_account values ('tng08.near');
insert into competition.excluded_account values ('tng09.near');

-- exclude third party market makers

end;

