﻿// cd /d D:\USB\cgi-bin\program\wiki && node 20190101.featured_content_maintainer.js

/*

 2019/1/1 13:39:58	初版試營運: 每日更新 zhwiki 首頁特色內容
 2019/1/5 12:32:58	轉換成經過繁簡轉換過的最終標題。
 2019/1/9 21:22:42	重構程式碼: using FC_data_hash

 // 輪流展示列表

 */

'use strict';

// Load CeJS library and modules.
require('./wiki loder.js');

var
/** {Object}wiki operator 操作子. */
wiki = Wiki(true);

// ---------------------------------------------------------------------//

var JDN_today = CeL.Julian_day(new Date),
// + 1: 明天 JDN_tomorrow
JDN_to_generate = JDN_today
		+ (CeL.env.arg_hash && CeL.env.arg_hash.days_later || 1),
//
JDN_search_to = Math.max(JDN_today, JDN_to_generate - 1),
// 開始有特色內容頁面的日期。
JDN_start = CeL.Julian_day.from_YMD(2013, 8, 20, true),
// 開始廢棄"特色條目"，採用"典範條目"的日期。
典範JDN = CeL.Julian_day.from_YMD(2017, 10, 1, true),
// {{#time:Y年n月|+1 day}}
// @see Template:Feature , Template:Wikidate/ymd
月日_to_generate = CeL.Julian_day.to_Date(JDN_to_generate).format('%m月%d日'),

FC_list_pages = 'WP:FA|WP:FL'.split('|'),
// [[Wikipedia:已撤銷的典範條目]] 條目連結
Former_FC_list_pages = 'WP:FFA|WP:FFL'.split('|'),
// Wikipedia:互助客栈/条目探讨
DISCUSSION_PAGE = 'Wikipedia:互助客栈/其他', DISCUSSION_edit_options = {
	section : 'new',
	sectiontitle : 月日_to_generate + '的首頁特色內容頁面似乎有問題，請幫忙處理',
	nocreate : 1,
	summary : 'bot: ' + 月日_to_generate + '的首頁特色內容頁面似乎有問題，無法排除，通知社群幫忙處理。'
},

KEY_IS_LIST = 0, KEY_ISFFC = 1,
// to {String}transcluding page title.
// e.g., FC_data[KEY_TRANSCLUDING_PAGE]="Wikipedia:典範條目/條目"
KEY_TRANSCLUDING_PAGE = 2, KEY_JDN = 3, KEY_LATEST_JDN = 4,
// FC_data_hash[redirected FC_title] = [ {Boolean}is_list,
// {Boolean}is former FC, {String}transcluding page title, [ JDN list ] ]
FC_data_hash = CeL.null_Object(),

error_title_list = [], FC_title_sorted, redirects_list_to_check = [],
// cache file of redirects
redirects_to_file = base_directory + 'redirects_to.json',
// redirects_to_hash[original_FC_title] = {String}FC_title 經過繁簡轉換過的最終標題
redirects_to_hash = CeL.get_JSON(redirects_to_file) || CeL.null_Object(),
// JDN_hash[FC_title] = JDN
JDN_hash = CeL.null_Object(),
// @see get_FC_title_to_transclude(FC_title)
FC_page_prefix = CeL.null_Object(),
/**
 * {RegExp}每日特色內容頁面所允許的[[w:zh:Wikipedia:嵌入包含]]正規格式。<br />
 * matched: [ all, transcluding_title, FC_page_prefix, FC_title ]
 */
PATTERN_FC_transcluded = /^\s*\{\{\s*((?:Wikipedia|wikipedia|維基百科|维基百科):((?:特色|典範|典范|优良)(?:條目|条目|列表))\/(?:(?:s|摘要)\|)?([^\/{}]+))\}\}\s*$/;

// ---------------------------------------------------------------------//
// main

// 先創建出/準備好本任務獨有的目錄，以便後續將所有的衍生檔案，如記錄檔、cache 等置放此目錄下。
prepare_directory(base_directory);

// CeL.set_debug(6);

CeL.wiki.cache([ {
	type : 'page',
	// assert: FC_list_pages 所列的頁面包含的必定是所有檢核過的特色內容標題。
	// TODO: 檢核FC_list_pages 所列的頁面是否是所有檢核過的特色內容標題。
	// Former_FC_list_pages: check [[Wikipedia:已撤銷的典範條目]]
	// FC_list_pages: 檢查WP:FA、WP:FL，提取出所有特色內容的條目連結，
	list : Former_FC_list_pages.concat(FC_list_pages),
	redirects : 1,
	reget : true,
	each : parse_each_FC_item_list_page
}, {
	type : 'redirects',
	// TODO: 一次取得大量頁面。
	list : function() {
		CeL.debug('redirects_to_hash = ' + JSON.stringify(redirects_to_hash));
		CeL.debug('FC_data_hash = ' + JSON.stringify(FC_data_hash));
		return Object.keys(FC_data_hash).filter(function(FC_title) {
			return !(FC_title in redirects_to_hash);
		});
	},
	reget : true,
	// 檢查特色內容列表頁面所列出的連結，其所指向的真正頁面標題。
	each : check_FC_redirects
}, {
	type : 'page',
	// TODO: 一次取得大量頁面。
	list : generate_FC_page_list,
	redirects : 1,
	// 並且檢查/解析所有過去首頁曾經展示過的特色內容頁面，以確定特色內容頁面最後一次展示的時間。（這個動作會作cache，基本上只會讀取新的日期。當每天執行的時候，只會讀取最近1天的頁面。）
	each : parse_each_FC_page
}, {
	type : 'redirects',
	// TODO: 一次取得大量頁面。
	list : redirects_list_to_check,
	reget : true,
	// 檢查出問題的頁面 (redirects_list_to_check) 是不是重定向所以才找不到。
	each : check_redirects
} ], check_date_page, {
	// JDN index in parse_each_FC_page()
	JDN : JDN_start,
	// index in check_redirects()
	redirects_index : 0,

	// default options === this
	// [SESSION_KEY]
	// session : wiki,
	// cache path prefix
	prefix : base_directory
});

// ---------------------------------------------------------------------//

function parse_each_FC_item_list_page(page_data) {
	/**
	 * {String}page title = page_data.title
	 */
	var title = CeL.wiki.title_of(page_data),
	/**
	 * {String}page content, maybe undefined. 條目/頁面內容 = revision['*']
	 */
	content = CeL.wiki.content_of(page_data),
	//
	matched, is_list = title.includes('列表')
	// e.g., 'Wikipedia:FL'
	|| (page_data.original_title || title).includes(':F?FL'),
	// 注意: 這包含了被撤銷後再次被評為典範的條目
	is_FFC = /:FF[AC]|已撤销的/.test([ page_data.original_title, page_data.title,
			title ].join('|')),
	//
	PATTERN_Featured_content = is_list && !is_FFC ? /\[\[:([^\[\]\|]+)(?:\|([^\[\]]*))?\]\]/g
			// @see [[Template:FA number]] 被標記為粗體的條目已經在作為典範條目時在首頁展示過
			: /'''\[\[([^\[\]\|]+)(?:\|([^\[\]]*))?\]\]'''/g;

	if (is_FFC) {
		// 去掉被撤銷後再次被評為典範的條目/被撤銷後再次被評為特色的列表
		content = content.replace(/\n== *被撤銷後[\s\S]+$/, '');
	}

	// CeL.log(content);
	// console.log([ page_data.original_title || title, is_FFC, is_list ]);
	while (matched = PATTERN_Featured_content.exec(content)) {
		// 還沒繁簡轉換過的標題。
		var FC_title = CeL.wiki.normalize_title(matched[1]);
		if (redirects_to_hash[FC_title]) {
			// 轉換成經過繁簡轉換過的最終標題。
			FC_title = redirects_to_hash[FC_title];
		}

		if (FC_title in FC_data_hash) {
			if (FC_data_hash[FC_title][KEY_ISFFC] === is_FFC) {
				CeL.warn('Duplicate FC title: ' + FC_title + '; '
						+ FC_data_hash[FC_title]);
			} else {
				CeL.error(CeL.wiki.title_link_of(FC_title)
						+ '被同時列在了現存及被撤銷的特色內容清單中!');
			}
		}
		var FC_data = FC_data_hash[FC_title] = [];
		FC_data[KEY_IS_LIST] = is_list;
		FC_data[KEY_ISFFC] = is_FFC;
		FC_data[KEY_JDN] = [];
	}
}

// ---------------------------------------------------------------------//

function check_FC_redirects(page_list) {
	// console.log(page_list);
	var original_FC_title = page_list.query_title;
	if (!original_FC_title) {
		throw '無法定位的重定向資料! 照理來說這不應該發生! ' + JSON.stringify(page_list);
	}
	// 經過繁簡轉換過的最終標題。
	var FC_title = CeL.wiki.title_of(page_list[0]);
	var isFFC = FC_data_hash[original_FC_title]
			&& FC_data_hash[original_FC_title][KEY_ISFFC];

	if (original_FC_title !== FC_title) {
		CeL.debug(CeL.wiki.title_link_of(original_FC_title) + ' → '
				+ CeL.wiki.title_link_of(FC_title));
		redirects_to_hash[original_FC_title] = FC_title;
		// 搬移到經過繁簡轉換過的最終標題。
		if (FC_data_hash[original_FC_title]) {
			if (FC_data_hash[FC_title]) {
				CeL.error('check_FC_redirects: 標題已經登記過: '
						+ CeL.wiki.title_link_of(FC_title) + ' ← '
						+ CeL.wiki.title_link_of(original_FC_title));
			} else {
				FC_data_hash[FC_title] = FC_data_hash[original_FC_title];
				delete FC_data_hash[original_FC_title];
			}
		}
	}

	page_list.forEach(function(page_data) {
		// cache 所有標題，以避免下次還要 reget。
		redirects_to_hash[page_data.title] = FC_title;
	});
}

// ---------------------------------------------------------------------//

// get page name of FC_title to transclude
function get_FC_title_to_transclude(FC_title) {
	var FC_data = FC_data_hash[FC_title];
	return FC_data[KEY_TRANSCLUDING_PAGE]
			|| ('Wikipedia:' + (FC_data[KEY_IS_LIST] ? '特色列表' : '典範條目') + '/' + FC_title);
}

// get page name of JDN to transclude
function get_FC_date_title_to_transclude(JDN) {
	return 'Wikipedia:' + (JDN < 典範JDN ? '特色條目' : '典範條目')
			+ CeL.Julian_day.to_Date(JDN).format('/%Y年%m月%d日');
}

function generate_FC_page_list() {
	var title_list = [];

	for (var JDN = JDN_start; JDN <= JDN_search_to; JDN++) {
		title_list.push(get_FC_date_title_to_transclude(JDN));
	}

	return title_list;
}

function parse_each_FC_page(page_data) {
	/**
	 * {String}page title = page_data.title
	 */
	var title = CeL.wiki.title_of(page_data),
	/**
	 * {String}page content, maybe undefined. 條目/頁面內容 = revision['*']
	 */
	content = CeL.wiki.content_of(page_data),
	//
	JDN = this.JDN++, matched = content
			&& content.replace(/<!--[\s\S]*?-->/g, '').match(
					PATTERN_FC_transcluded);

	// return error
	function check_FC_title(FC_title) {
		if (!FC_title)
			return true;
		var FC_data = FC_data_hash[FC_title];
		if (FC_data) {
			FC_data[KEY_JDN].push(JDN);
			FC_data[KEY_TRANSCLUDING_PAGE] = matched[1].replace(/\/(?:s|摘要)\|/,
					'\/');
		} else {
			return true;
		}
	}

	if (matched) {
		var FC_title = CeL.wiki.normalize_title(matched[3]);
		if (check_FC_title(FC_title)
				&& check_FC_title(redirects_to_hash[FC_title])) {
			// 可能繁簡轉換不同/經過重定向了?
			CeL.debug('不再是特色/典範了? ' + matched[2] + ' '
					+ CeL.wiki.title_link_of(FC_title));
			redirects_list_to_check.push(FC_title);
			(FC_data_hash[FC_title] = [])[KEY_JDN] = [];
			check_FC_title(FC_title);
		}

	} else {
		error_title_list.push(title);
		if (CeL.is_debug())
			CeL.error(title + ': ' + content);
	}
}

// ---------------------------------------------------------------------//

function check_redirects(page_list) {
	// console.log(page_list);
	var original_FC_title = page_list.query_title;
	if (!original_FC_title) {
		throw '無法定位的重定向資料! 照理來說這不應該發生! ' + JSON.stringify(page_list);
	}
	// 經過繁簡轉換過的最終標題。
	var FC_title = CeL.wiki.title_of(page_list[0]);

	var not_found;
	if (original_FC_title !== FC_title) {
		CeL.debug(CeL.wiki.title_link_of(original_FC_title) + ' → '
				+ CeL.wiki.title_link_of(FC_title));
		redirects_to_hash[original_FC_title] = FC_title;
		// 搬移到經過繁簡轉換過的最終標題。
		if (FC_data_hash[original_FC_title]) {
			if (FC_data_hash[FC_title]) {
				// 標題已經登記過. merge.
				if (!FC_data_hash[FC_title][KEY_TRANSCLUDING_PAGE]) {
					FC_data_hash[FC_title][KEY_TRANSCLUDING_PAGE] = FC_data_hash[original_FC_title][KEY_TRANSCLUDING_PAGE];
				}
				FC_data_hash[FC_title][KEY_JDN].append(
						FC_data_hash[original_FC_title][KEY_JDN]).sort();
				delete FC_data_hash[original_FC_title];
			} else {
				not_found = true;
				FC_data_hash[FC_title] = FC_data_hash[original_FC_title];
				delete FC_data_hash[original_FC_title];
			}
		} else {
			throw '未發現' + CeL.wiki.title_link_of(original_FC_title)
					+ '的資料! 照理來說這不應該發生!';
		}
	} else {
		not_found = true;
	}

	if (not_found) {
		CeL.warn('過去曾經在 '
				+ CeL.Julian_day.to_Date(
						FC_data_hash[original_FC_title][KEY_JDN][0]).format(
						'%Y年%m月%d日') + ' 包含過的特色內容，並未登記在現存或已被撤銷的登記列表頁面中: '
				+ CeL.wiki.title_link_of(original_FC_title) + '。'
				+ '若原先內容轉成重定向頁，使此遭提指向了重定向頁，請修改特色內容列表頁面上的標題，使之連結至實際標題；'
				+ '並且將 Wikipedia:典範條目/下的簡介頁面移到最終指向的標題。'
				+ '若這是已經撤銷的特色內容，請加入相應的已撤銷列表頁面。'
				+ '若為標題標點符號全形半形問題，請將之移動到標點符號完全相符合的標題。');
	}

	page_list.forEach(function(page_data) {
		// cache 所有標題，以避免下次還要 reget。
		redirects_to_hash[page_data.title] = FC_title;
	});
}

// ---------------------------------------------------------------------//

// 不是日期頁面嵌入的、有問題的標題。
function is_FC(FC_title) {
	var FC_data = FC_data_hash[FC_title];
	return FC_data && FC_data[KEY_ISFFC] === false;
}

function check_date_page() {
	// write cache
	CeL.write_file(redirects_to_file, redirects_to_hash);

	FC_title_sorted = Object.keys(FC_data_hash).filter(function(FC_title) {
		if (is_FC(FC_title)) {
			var FC_data = FC_data_hash[FC_title];
			FC_data[KEY_LATEST_JDN] = FC_data[KEY_JDN].length > 0
			//
			? FC_data[KEY_JDN][FC_data[KEY_JDN].length - 1]
			// : Infinity: 沒上過首頁的頁面因為不存在簡介/摘要頁面，所以必須要排在最後，不能夠列入顯示。
			: 0;
			return true;
		}
	}).sort(function(FC_title_1, FC_title_2) {
		return FC_data_hash[FC_title_1][KEY_LATEST_JDN]
		// TODO: 檢查簡介/摘要頁面是否存在。
		- FC_data_hash[FC_title_2][KEY_LATEST_JDN];
	});

	var index = 0,
	//
	report = '{| class="wikitable sortable"\n|-\n'
	//
	+ '!#!!標題!!上次展示時間!!上過首頁次數!!簡介頁面\n'
	//
	+ FC_title_sorted.map(function(FC_title) {
		var FC_data = FC_data_hash[FC_title],
		//
		JDN = FC_data[KEY_LATEST_JDN];
		return '|-\n|' + [ ++index, CeL.wiki.title_link_of(FC_title), JDN ?
		//
		'[[' + get_FC_date_title_to_transclude(JDN) + '|'
		//
		+ CeL.Julian_day.to_Date(JDN).format('%Y年%m月%d日') + ']]'
		//
		: '沒上過首頁', FC_data[KEY_JDN].length,
		//
		CeL.wiki.title_link_of(FC_data[KEY_TRANSCLUDING_PAGE]
		//
		|| get_FC_title_to_transclude(FC_title)) ].join('||');
	}).join('\n') + '\n|}';
	if (error_title_list.length > 0) {
		report += '\n==本次檢查發現有比較特殊格式的頁面(包括非嵌入頁面)==\n# '
				+ error_title_list.join('\n# ');
	}
	wiki.page('Wikipedia:首頁/特色內容展示報告').edit(report, {
		bot : 1,
		nocreate : 1,
		summary : 'bot: 首頁特色內容更新報告'
	});

	// [[Wikipedia:首页/明天]]是連鎖保護
	/** {String}隔天首頁將展示的特色內容分頁title */
	var date_page_title = get_FC_date_title_to_transclude(JDN_to_generate);
	wiki.page(date_page_title, function(page_data) {
		var
		/**
		 * {String}page content, maybe undefined. 條目/頁面內容 = revision['*']
		 */
		content = CeL.wiki.content_of(page_data);

		if (!content || !(content = content.trim())) {
			write_date_page(date_page_title);
			return;
		}

		// 最後檢查隔天首頁將展示的特色內容分頁，如Wikipedia:典範條目/2019年1月1日，如有破壞，通知社群：Wikipedia:互助客棧/條目探討。
		var matched = content.replace(/<!--[\s\S]*?-->/g, '').match(
				PATTERN_FC_transcluded);

		if (!matched) {
			wiki.page(DISCUSSION_PAGE).edit(function(page_data) {
				var
				/**
				 * {String}page content, maybe undefined. 條目/頁面內容 =
				 * revision['*']
				 */
				content = CeL.wiki.content_of(page_data);

				if (!content.includes(
				// 避免多次提醒。
				CeL.wiki.title_link_of(date_page_title))) {
					return '[[Wikipedia:首頁/明天|明天的首頁]]特色內容頁面（'
					//
					+ CeL.wiki.title_link_of(date_page_title)
					//
					+ '）似乎並非標準的嵌入包含頁面格式，請幫忙處理，謝謝。 --~~~~';
				}
			}, DISCUSSION_edit_options).run(check_month_list);
			return;
		}

		var FC_title = CeL.wiki.normalize_title(matched[3]);
		if (!is_FC(FC_title)) {
			wiki.page(DISCUSSION_PAGE).edit(function(page_data) {
				var
				/**
				 * {String}page content, maybe undefined. 條目/頁面內容 =
				 * revision['*']
				 */
				content = CeL.wiki.content_of(page_data);

				if (content
				// 避免多次提醒。
				&& content.includes(CeL.wiki.title_link_of(date_page_title))) {
					CeL.log('已經做過提醒。');
					return;
				}

				return '[[Wikipedia:首頁/明天|明天的首頁]]特色內容頁面（'
				//
				+ CeL.wiki.title_link_of(date_page_title)
				//
				+ '）所嵌入包含的標題似乎並非特色內容標題？'
				//
				+ '若包含的頁面確實並非特色內容，請幫忙處理，謝謝。 --~~~~';

			}, DISCUSSION_edit_options).run(check_month_list);
			return;
		}

		check_if_FC_introduction_exists(FC_title, date_page_title, matched[1]);

	}, {
		redirects : 1
	});

}

// ---------------------------------------------------------------------//

// 然後自還具有特色內容資格的條目中，挑選出沒上過首頁、抑或最後展示時間距今最早的頁面（此方法不見得會按照日期順序來展示），
function write_date_page(date_page_title, transcluding_title_now) {
	var FC_title = FC_title_sorted[0];
	if (CeL.env.arg_hash && CeL.env.arg_hash.environment === 'production') {
		for (var index = 1; !is_FC(FC_title)
		// 每天凌晨零時之前，若是頁面還不存在，就會找一個之前曾經上過首頁的最古老 FC_title 頁面來展示。
		// assert: 上過首頁的都必定有介紹頁面。
		&& index < FC_title_sorted.length; index++) {
			FC_title = FC_title_sorted[index];
		}
	}
	if (!is_FC(FC_title)) {
		// TODO: 檢查簡介/摘要頁面是否存在。
		throw '沒有可供選擇的特色內容頁面! 照理來說這不應該發生!';
	}

	var transcluding_title = get_FC_title_to_transclude(FC_title),
	//
	write_content = '{{' + transcluding_title + '}}';
	// console.log(write_content);

	wiki.page(date_page_title);
	if (transcluding_title_now) {
		// assert: (transcluding_title_now) 為
		// 現在 (date_page_title) 頁面中嵌入但*有問題*的頁面。
		if (CeL.env.arg_hash && CeL.env.arg_hash.environment === 'production') {
			if (transcluding_title === transcluding_title_now) {
				wiki.edit('', {
					nocreate : 1,
					summary : 'production environment 下，'
							+ '如果沒有人處理的話應該有補救措施（即便最後留空）。'
				});
				check_month_list();
				return;
			}
			// else: write (write_content)
		} else {
			// assert: 已經提醒過 (DISCUSSION_PAGE)。
			check_month_list();
			return;
		}
	}

	// 如若不存在，採用嵌入包含的方法寫入隔天首頁將展示的特色內容分頁裡面，展示為下一個首頁特色內容。
	wiki.edit(write_content, {
		// bot : 1,
		summary : 'bot: 自動更新首頁特色內容：' + CeL.wiki.title_link_of(FC_title)
		//
		+ (is_FC(FC_title) ? '上次展示時間為'
		//
		+ CeL.Julian_day.to_YMD(FC_data_hash[FC_title][KEY_LATEST_JDN], true)
		//
		.join('/') : '沒上過首頁') + '。作業機制請參考'
				+ CeL.wiki.title_link_of('Wikipedia:首頁/特色內容展示設定')
				+ ' 編輯摘要的red link經繁簡轉換後存在'
	});

	if (is_FC(FC_title)) {
		check_month_list();
	} else {
		// 預防新當選條目沒有準備展示內容的情況。
		check_if_FC_introduction_exists(FC_title, date_page_title,
				transcluding_title);
	}
}

// ---------------------------------------------------------------------//

// 確認簡介頁面存在。
function check_if_FC_introduction_exists(FC_title, date_page_title,
		transcluding_title) {
	if (!transcluding_title)
		transcluding_title = get_FC_title_to_transclude(FC_title);

	wiki.page(transcluding_title, function(page_data) {
		var
		/**
		 * {String}page content, maybe undefined. 條目/頁面內容 = revision['*']
		 */
		content = CeL.wiki.content_of(page_data);

		if (content && content.trim()
		// TODO: 進一步檢查簡介頁面
		) {
			check_month_list();
			return;
		}

		// environment=production
		if (CeL.env.arg_hash && CeL.env.arg_hash.environment === 'production') {
			write_date_page(date_page_title, transcluding_title);
			return;
		}

		wiki.page(DISCUSSION_PAGE).edit(function(page_data) {
			var
			/**
			 * {String}page content, maybe undefined. 條目/頁面內容 = revision['*']
			 */
			content = CeL.wiki.content_of(page_data),
			//
			write_link = CeL.wiki.title_link_of(transcluding_title, '撰寫簡介');

			// 避免多次提醒。
			if (content.includes(write_link)) {
				CeL.log('已經做過提醒。');
				return;
			}

			return '[[Wikipedia:首頁/明天|明天的首頁]]特色內容頁面（'
			//
			+ CeL.wiki.title_link_of(date_page_title)
			//
			+ '）所嵌入包含的特色內容' + CeL.wiki.title_link_of(FC_title)
			//
			+ '似乎還不存在簡介？' + '或許簡介頁面存放在"Wikipedia:優良條目/"下？'
			//
			+ '若簡介頁面確實不存在，請幫忙' + write_link + '，謝謝。 --~~~~';

		}, DISCUSSION_edit_options).run(check_month_list);
		return;
	}, {
		redirects : 1
	});
}

// ---------------------------------------------------------------------//

// 若不存在則自動創建每月特色內容存檔：如[[Wikipedia:典範條目/2019年1月]]，
function check_month_list() {
	var date = CeL.Julian_day.to_Date(JDN_to_generate);
	wiki.page(date.format('Wikipedia:典範條目/%Y年%m月'), function(page_data) {
		var
		/**
		 * {String}page content, maybe undefined. 條目/頁面內容 = revision['*']
		 */
		content = CeL.wiki.content_of(page_data);

		if (content && content.trim()) {
			finish_up();
			return;
		}

		content = [
				'__NOTOC__<!---->__NOEDITSECTION__<!---->'
						+ '{{Wikipedia:典範條目/存檔表頭}}',
				'{|width="100%" border="1" cellspacing="8" cellpadding="4"'
						+ ' style="background:transparent;border:0;"' ];
		var day = 1;
		while (true) {
			date.setDate(day);
			if (date.getDate() !== day++)
				break;
			if (date.getDate() % 2 === 1)
				content.push('|-');
			content.push(date.format('{{Wikipedia:典範條目/日期|%Y年%m月%d日}}'));
		}
		content.push('|}');
		wiki.edit(content.join('\n'), {
			summary : 'bot: 自動創建每月特色內容存檔'
		}).run(finish_up);
	}, {
		redirects : 1
	});
}

function finish_up() {
	if (error_title_list.length > 0) {
		CeL.warn('本次檢查發現有比較特殊格式的頁面(包括非嵌入頁面)：\n# '
				+ error_title_list.join('\n# '));
	}
}