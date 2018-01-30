﻿/*

	初版完成，試營運。


@see

badge:
https://www.wikidata.org/wiki/Wikidata:Database_reports/badged_items_without_claims
https://www.mediawiki.org/wiki/Manual:Page_props_table
https://en.wikipedia.org/wiki/User:FACBot/flc.pl
https://www.wikidata.org/wiki/User:DeltaBot
https://github.com/Pascalco/DeltaBot/blob/master/badges.py

 */

'use strict';

// Load CeJS library and modules.
require('./wiki loder.js');

CeL.run('application.storage');

var
/** {Object}wiki operator 操作子. */
wiki = Wiki(true),
//
MIN_COUNT = 50, reget = false,
//
most_sitelinked_items_filename = base_directory + 'most_sitelinked_items.json';

/** {String}編輯摘要。總結報告。 */
summary = '';

// ----------------------------------------------------------------------------
// main

// 先創建出/準備好本任務獨有的目錄，以便後續將所有的衍生檔案，如記錄檔、cache 等置放此目錄下。
prepare_directory(base_directory);

// CeL.set_debug(6);

var items_without = CeL.null_Object(),
//
SQL_session = new CeL.wiki.SQL(function(error) {
	if (error) {
		throw error;
	}
}, 'wikidata');

get_most_sitelinked_items(function(item_count_pairs) {

	var language = 'zh';
	get_most_sitelinked_items_exclude_language(language, function(item_list) {
		exclude_non_article(item_list, {
			language : language,
			reget : reget,
			item_count_pairs : item_count_pairs
		});
		return;

		for ( var link_count in items_of_count) {
			link_count = +link_count;
		}

		return;

		get_most_sitelinked_items_exclude_language('ja', function(
				items_of_count, item_list) {
			SQL_session.connection.destroy();
			if (false) {
				console.log(Object.keys(items_of_count.map(function(count) {
					return +count;
				}).sort(function(a, b) {
					return a - b;
				})));
			}
			CeL.info('Done.');
		}, {
			reget : reget,
			item_count_pairs : item_count_pairs
		});

	}, {
		reget : reget,
		item_count_pairs : item_count_pairs
	});

}, {
	reget : reget
});

// ----------------------------------------------------------------------------

// get sitelink count of wikidata items: item_count_pairs.
// https://www.mediawiki.org/wiki/Wikibase/Schema/wb_items_per_site
// https://www.wikidata.org/w/api.php?action=help&modules=wbsetsitelink
function get_most_sitelinked_items(callback, options) {
	function write_most_sitelinked_items(error, rows, fields) {
		if (error) {
			throw error;
		}

		CeL.info('All ' + rows.length + ' items more than ' + MIN_COUNT
				+ ' sitelinks.');
		var items_of_count = CeL.null_Object(), item_count_pairs = [];
		rows.forEach(function(row) {
			var item_id = row.ips_item_id, link_count = row.link_count;
			// item_count_pairs = [ [item_id,link_count], ... ]
			item_count_pairs.push([ item_id, link_count ]);
			return;

			// items_of_count[link_count] = [ item_id, item_id, item_id, ... ]
			if (items_of_count[link_count]) {
				items_of_count[link_count].push(item_id);
			} else {
				items_of_count[link_count] = [ item_id ];
			}
		});

		CeL.write_file(data_filename, JSON.stringify(item_count_pairs));
		callback(item_count_pairs);
	}

	options = CeL.setup_options(options);
	var data_filename = options.filename || most_sitelinked_items_filename;

	if (!options.reget) {
		var JSON_data = CeL.read_file(data_filename);
		if (JSON_data && (JSON_data = JSON.parse(JSON_data))) {
			callback(JSON_data);
			return;
		}
	}

	var SQL_get_sitelink_count;
	// 若是採用
	// HAVING SUM(CASE WHEN ips_site_id = "jawiki" THEN 1 ELSE 0 END) = 0
	// ORDER BY `link_count` DESC
	// 之類的方法，將大大增加查詢的時間。
	SQL_get_sitelink_count = 'SELECT ips_item_id, COUNT(*) AS `link_count` FROM wb_items_per_site GROUP BY ips_item_id HAVING `link_count` >= '
			+ MIN_COUNT + ' ORDER BY ips_item_id';

	CeL.info('get_most_sitelinked_items: Run SQL: ' + SQL_get_sitelink_count);

	// 取得所有姐妹項目連結超過 MIN_COUNT 的 item項目。
	SQL_session.SQL(SQL_get_sitelink_count, write_most_sitelinked_items);
}

// 排除包含指定語言((language))連結的 item項目。
function get_most_sitelinked_items_exclude_language(language, callback, options) {
	function write_most_sitelinked_items_exclude_language(error, rows, fields) {
		if (error) {
			throw error;
		}

		// row: 在((language))這個語言中有連結的 item項目。
		CeL.info(language + ': ' + rows.length + ' items more than '
				+ MIN_COUNT + ' sitelinks. Filtering items...');
		// item_list, items_of_count 僅包含排除了((language))這個語言連結的 item項目。
		var items_of_count = CeL.null_Object(), item_list = [], index_of_rows = 0, id_of_current_row = rows[index_of_rows].ips_item_id;
		// 示意範例: rows = [ 1,3,5 ]
		// item_count_pairs = [ [1,1], [2,1], [3,1], [4,1], [5,1], ]
		options.item_count_pairs.forEach(function(pair) {
			var item_id = pair[0];
			if (item_id === id_of_current_row) {
				id_of_current_row = rows[++index_of_rows]
						&& rows[index_of_rows].ips_item_id;
				return;
			}

			// item_list = [ item_id, item_id, item_id, ... ]
			item_list.push(item_id);
			return;

			var link_count = pair[1];
			// items_of_count[link_count] = [ item_id, item_id, item_id, ... ]
			if (link_count in items_of_count) {
				items_of_count[link_count].push(item_id);
			} else {
				items_of_count[link_count] = [ item_id ];
			}
		});
		if (id_of_current_row) {
			throw '當前 rows[' + index_of_rows + '] 還有資訊尚未處理!';
		}

		CeL.write_file(data_filename, JSON.stringify(item_list));
		callback(item_list);
	}

	options = CeL.setup_options(options);
	var data_filename = options.filename
			|| most_sitelinked_items_filename.replace(/(\.[a-z]+)?$/,
					'.exclude_' + language + '$1');

	if (!options.reget) {
		var JSON_data = CeL.read_file(data_filename);
		if (JSON_data && (JSON_data = JSON.parse(JSON_data))) {
			callback(JSON_data);
			return;
		}
	}

	var SQL_get_sitelink_count;
	// Error: ER_OPERAND_COLUMNS: Operand should contain 1 column(s)
	SQL_get_sitelink_count = 'SELECT ips_item_id FROM wb_items_per_site WHERE ips_item_id IN ('
			+ SQL_get_sitelink_count
			+ ') AND ips_site_id = "'
			+ language
			+ 'wiki"';

	SQL_get_sitelink_count = 'SELECT ips_item_id FROM wb_items_per_site WHERE ips_item_id IN (SELECT ips_item_id FROM wb_items_per_site GROUP BY ips_item_id HAVING COUNT(*) >= '
			+ MIN_COUNT
			+ ') AND ips_site_id = "'
			+ language
			+ 'wiki" ORDER BY ips_item_id';

	CeL.info('get_most_sitelinked_items_exclude_language: Run SQL: '
			+ SQL_get_sitelink_count);

	// 取得所有姐妹項目連結超過 MIN_COUNT，且其中包含有((language))語言維基百科連結的 item項目。
	SQL_session.SQL(SQL_get_sitelink_count,
			write_most_sitelinked_items_exclude_language);
}

function exclude_non_article(item_list, options) {
	// 排除非條目之頁面。
	function write_non_article(error, rows) {
		if (error) {
			throw error;
		}

		// 新取得的 item_list 中非條目的 item項目。
		var new_non_article_item_list = rows.map(function(row) {
			return row.ips_item_id;
		});

		non_article_item_list.append(new_non_article_item_list);
		non_article_item_list.sort();
		CeL.write_file(non_article_file_name, JSON
				.stringify(non_article_item_list));
		// Release memory. 釋放被占用的記憶體.
		// non_article_item_list = null;

		var index_of_non_article = 0,
		//
		this_non_article = new_non_article_item_list[0];

		// 第二次篩選。
		// item_list_to_check -= new_non_article_item_list
		item_list_to_check = item_list_to_check.filter(function(item_id) {
			if (item_id === this_non_article) {
				this_non_article
				//
				= new_non_article_item_list[++index_of_non_article];
			} else {
				return true;
			}
		});

		CeL.info(options.language + ': ' + item_list_to_check.length
				+ ' items.');
		CeL.log(item_list_to_check.slice(0, 100).map(function(item_id) {
			return item_id + ': ' + options.item_count_pairs[item_id] + '\n';
		}));
	}

	options = CeL.setup_options(options);

	var non_article_file_name = options.filename
			|| most_sitelinked_items_filename.replace(/(\.[a-z]+)?$/,
					'.non_article$1'),
	// 非條目的 item項目 cache: non_article_item_list = [ item_id, item_id, ... ]
	non_article_item_list = CeL.read_file(non_article_file_name);

	var item_list_to_check;

	if (non_article_item_list
			&& Array.isArray(non_article_item_list = JSON
					.parse(non_article_item_list))) {
		item_list_to_check = [];
		var index_of_non_article = 0, this_non_article = non_article_item_list[0];

		// 先篩選一批。
		item_list.forEach(function(item_id) {
			while (this_non_article < item_id) {
				this_non_article
				//
				= non_article_item_list[++index_of_non_article];
			}
			if (this_non_article === item_id) {
				this_non_article
				//
				= non_article_item_list[++index_of_non_article];
			} else {
				item_list_to_check.push(item_id);
			}
		});

	} else {
		non_article_item_list = [];
		item_list_to_check = item_list;
	}

	// Release memory. 釋放被占用的記憶體.
	item_list = null;

	var SQL_get_non_article = 'SELECT ips_item_id FROM wb_items_per_site WHERE ips_item_id IN ('
			+ item_list_to_check.join(',')
			+ ') AND (ips_site_page LIKE "Template:%"'
			+ ' OR ips_site_page LIKE "Category:%"'
			+ ' OR ips_site_page LIKE "Wikipedia:%"'
			// + ' OR ips_site_page LIKE "% Talk:%"'
			+ ' OR ips_site_page LIKE "Project:%"'
			+ ' OR ips_site_page LIKE "Portal:%"'
			+ ' OR ips_site_page LIKE "Help:%"'
			+ ') GROUP BY ips_item_id ORDER BY ips_item_id';

	CeL.info('exclude_non_article: Run SQL: '
			+ SQL_get_non_article.slice(0, 200) + '...');

	// 取得 item_list 中所有非條目的 item項目。
	SQL_session.SQL(SQL_get_non_article, write_non_article);
}