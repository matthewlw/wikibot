﻿/*

2020/2/6	擷取redirect_to,logs,discussions三項資訊
2020/2/8 17:19:57	增加報告
	初版試營運

TODO:

 */

'use strict';

// Load CeJS library and modules.
require('../wiki loader.js');

// Set default language. 改變預設之語言。 e.g., 'zh'
set_language('en');
/** {Object}wiki operator 操作子. */
const wiki = new Wikiapi;

prepare_directory(base_directory, true);

// ----------------------------------------------

const PATTERN_AfD_page = /^Wikipedia:Articles for deletion\/([^\/]+)$/;


// ----------------------------------------------------------------------------

(async () => {
	await wiki.login(user_name, user_password, use_language);
	// await wiki.login(null, null, use_language);
	await main_process();
})();

async function main_process() {
	// await for_AfD('Wikipedia:Articles for deletion/Quintana Olleras');
	// await for_AfD('Wikipedia:Articles for deletion/Michael Breslin Murphy');
	// await for_AfD('Wikipedia:Articles for deletion/Andy Duncan (musician)');

	//for_AfD_list(await wiki.page('Wikipedia:Articles for deletion/Log/2020 February 1'));

	for (let date = 1; date < 6; date++) {
		for_AfD_list(await wiki.page('Wikipedia:Articles for deletion/Log/2020 February ' + date));
	}
}

// ----------------------------------------------------------------------------

async function for_AfD_list(AfD_list_page_data) {
	//CeL.info(`${CeL.wiki.title_link_of(AfD_list_page_data)}: start:`);
	const parsed = AfD_list_page_data.parse();
	const main_page_title_list = [];
	const discussion_title_list = [];
	parsed.each('transclusion', token => {
		const discussion_page_title = token.name;
		const matched = discussion_page_title.match(PATTERN_AfD_page);
		if (matched
			//For only single AfD
			//&& discussion_page_title.includes('Tok Nimol')
		) {
			main_page_title_list.push(matched[1]);
			discussion_title_list.push(discussion_page_title);
		}
	});
	// console.log(discussion_title_list);
	const page_data_hash = Object.create(null);
	await wiki.for_each_page(main_page_title_list, page_data => page_data_hash[page_data.title] = page_data, { no_edit: true });

	const all_report_lines = [];
	await wiki.for_each_page(discussion_title_list, for_AfD, { no_edit: true, all_report_lines, page_data_hash });
	//console.log(all_report_lines);
	const report_wikitext = `{{Please leave this line alone (sandbox heading)}}\n\n== Report for ${CeL.wiki.title_link_of(AfD_list_page_data)} if no participants ==\n\n${all_report_lines.join('\n\n')}`;
	//CeL.info(`${CeL.wiki.title_link_of(AfD_list_page_data)}: write report:`);
	//console.log(report_wikitext);
	await wiki.edit_page('Wikipedia:Sandbox', report_wikitext, { summary: 'Report for ' + CeL.wiki.title_link_of(AfD_list_page_data) });
}

// ----------------------------------------------------------------------------

const now = new Date;

function to_timestamp(log) {
	let date = log.timestamp;
	if (date) {
		date = new Date(date);
		if (false && now.getFullYear() - date.getFullYear() > 1)
			return date.getFullYear();
		return date.format('%Y-%2m');
	}
	console.error(log);
	throw new Error('Can not ertract timestamp!');
}

// ----------------------------------------------------------------------------

function extract_target_page_of_AfD(AfD_page_data) {
	const parsed = AfD_page_data.parse();
	/** {String}target page title */
	let target_page_title;
	parsed.each('template', token => {
		// Wikipedia:Articles for deletion/Quintana Olleras
		// Wikipedia:Articles for deletion/Reem Al Marzouqi (2nd nomination)
		// Wikipedia:Articles for deletion/Race and intelligence 2
		// Wikipedia:Articles for deletion/Race and intelligence (4th
		// nomination)
		if (token.name === 'La') {
			target_page_title = token.parameters[1];
			if (target_page_title)
				return parsed.each.exit;
		}
	});
	if (!target_page_title) {
		// [[Wikipedia:Articles for deletion/Michael Breslin Murphy]]
		// [[Wikipedia:Articles for deletion/Race and intelligence]]
		parsed.each('section_title', token => {
			if (token.some(_token => {
				if (_token.type === 'link')
					return target_page_title = _token[0].toString();
			})) {
				return parsed.each.exit;
			}
		});
	}
	return target_page_title;
}

// TODO: check if there are participations.
function check_AfD_participations(AfD_page_data) {
	const participations = Object.create(null);
	//preserve sort
	check_AfD_participations.recommendation_types.forEach(type => { participations[type] = []; });
	participations[check_AfD_participations.type_others] = [];
	const parsed = AfD_page_data.parse();

	parsed.each('list', list_token => {
		list_token.forEach(token => {
			let recommendation = token.toString().match(/'''(.+?)'''/);
			if (!recommendation)
				return;
			recommendation = recommendation[1].toLowerCase().match(check_AfD_participations.PATTERN)
				|| check_AfD_participations.type_others;
			participations[recommendation].push(participations);
		});
	}, { level_filter: 1 });

	check_AfD_participations.recommendation_types.forEach(type => {
		if (participations[type].length === 0)
			delete participations[type];
	});
	if (!CeL.is_empty_object(participations))
		return participations;
}

check_AfD_participations.recommendation_types = 'keep|delete|merge|redirect'.split('|');
check_AfD_participations.type_others = 'misc';
check_AfD_participations.PATTERN = new RegExp(check_AfD_participations.recommendation_types.join('|'));

// ----------------------------------------------------------------------------

async function get_AfD_discussions(target_page_title, AfD_page_data) {
	const linkshere = await wiki.linkshere(target_page_title, { namespace: 'Wikipedia' });
	// CeL.info(`${CeL.wiki.title_link_of(AfD_page_data)}: linkshere`);
	// console.log(linkshere);

	const discussion_page_list = [];
	for (let discussion_page_data of linkshere) {
		if (PATTERN_AfD_page.test(discussion_page_data.title)
			? AfD_page_data && discussion_page_data.title === AfD_page_data.title || discussion_page_data.title.startsWith('Wikipedia:Articles for deletion/Log/')
			: !discussion_page_data.title.startsWith('Wikipedia:Requests for undeletion')) {
			continue;
		}

		discussion_page_list.push(discussion_page_data);
	}
	// CeL.info(`${CeL.wiki.title_link_of(AfD_page_data)}:
	// discussion_page_list`);
	// console.log(discussion_page_list);
	if (discussion_page_list.length === 0)
		return;

	const previous_discussions = [], related_discussions = [];
	await wiki.for_each_page(discussion_page_list, discussion_page_data => {
		/**
		 * <code>
		
		[[Wikipedia:Articles for deletion/Michael Breslin Murphy]]
		The result was '''Merge''' and '''redirect''' to [[Break (music)]].
		[[Wikipedia:Articles for deletion/Kevin cooper]]
		The result of the debate was '''SPEEDY DELETE'''.
		[[Wikipedia:Articles for deletion/Golden age hip hop]]
		The result of the debate was '''keep, nomination withdrawn'''.
		[[Wikipedia:Articles for deletion/Evolución (band)]]
		The result was '''keep'''.
		
		</code>
		 */
		let result = discussion_page_data.wikitext.match(/The result .+? '''(.+?)'''/)
			// Wikipedia:Articles for deletion/Race and intelligence
			// "The result of the debate was KEEP"
			|| discussion_page_data.wikitext.match(/The result .+? was (.+?)(?:.[ \n]|\n)/);
		if (!result || !(result = result[1])) {
			return;
		}
		if (false && AfD_page_data) {
			CeL.info(`${CeL.wiki.title_link_of(AfD_page_data)}: get_AfD_discussions of ${CeL.wiki.title_link_of(discussion_page_data)}: ${result}`);
			console.log(discussion_page_data);
		}

		const revision = discussion_page_data.revisions[0];
		const discussion_report = [revision, discussion_page_data, result];
		if (extract_target_page_of_AfD(discussion_page_data) === target_page_title) {
			previous_discussions.push(discussion_report);
		} else {
			related_discussions.push(discussion_report);
		}
	}, { no_edit: true });

	if (false && AfD_page_data) {
		CeL.info(`${CeL.wiki.title_link_of(AfD_page_data)}: get_AfD_discussions last`);
		console.log(previous_discussions);
		console.log(related_discussions);
	}
	function sort_discussions(discussions) {
		return discussions
			.sort((a, b) => a[0].timestamp < b[0].timestamp ? 1 : a[0].timestamp > b[0].timestamp ? -1 : 0)
			// discussion_report may contain links
			.map(item => `${CeL.wiki.title_link_of(item[1], to_timestamp(item[0]))} ${item[2]}`);
	}
	const report = {
		previous: sort_discussions(previous_discussions),
		related: sort_discussions(related_discussions)
	};
	if (previous_discussions.length > 0)
		report.result = [previous_discussions[0][2], previous_discussions[0][1].title];
	if (false && AfD_page_data) {
		CeL.info(`${CeL.wiki.title_link_of(AfD_page_data)}: get_AfD_discussions return`);
		console.log(report);
	}
	return report;
}

async function get_AfD_logs(target_page_title, result_notice_data) {
	const logs = [];
	for (let log of (await wiki.logevents(target_page_title))) {
		// console.log(log);
		let log_text;
		switch (log.action) {
			case 'move':
				// type: 'move'
				log_text = `${to_timestamp(log)} move to {{color|green|→}} ${log.params && log.params.target_title && CeL.wiki.title_link_of(log.params.target_title) || 'moved'}`;
				// 光 move 還可算是 PROD。直接貼上個 redirect 才是需列入 result_notice 的問題。
				/**
				 * What would make it ineligible is if the existing article
				 * (under discussion) was redirected elsewhere, leaving its
				 * history in the same location, meaning that someone redirected
				 * it in lieu of deletion. In this case, the article (and its
				 * page history) was moved to a new location, so this case
				 * should check both whether the title redirects AND whether the
				 * page history remains. Page moves would still be eligible for
				 * soft deletion/expired PROD by my read.
				 */
				if (logs.length === 0 && result_notice_data.redirect_to === log.params.target_title) {
					delete result_notice_data.redirect;
				}
				break;
			case 'delete':
				// type: 'delete'
				let is_PROD = log.comment && /PROD|soft deletion/.test(log.comment)
					// params: { tags: [ 'subst:prod' ] },
					// type: 'pagetriage-curation',
					|| Array.isArray(log.params && log.params.tags) && log.params.tags.some(tag => /prod/.test(tag));
				// [[WP:CSD]]
				let link = log.comment && log.comment.match(/\[\[[^\[\]]+\|[GARFCUTPX]\d{1,2}\]\]/);
				if (link)
					link = link[0];
				log_text = `${to_timestamp(log)} {{color|red|✗}} ` + (is_PROD ? '[[WP:PROD|]]' : link || 'deleted');
				if (!logs.note)
					logs.note = `${PROD_MESSAGE_PREFIX}it is NOT eligible for [[WP:SOFTDELETE|soft deletion]] because it has been [{{fullurl:Special:Log|page={{urlencode:${target_page_title}}}}} previously ${is_PROD ? "PROD'd" : 'deleted'}]${link ? ` (${link})` : ''}.`;
				break;
			case 'restore':
				// type: 'delete'
				// [[File:Gnome-undelete.svg|20px]]
				log_text = `${to_timestamp(log)} {{color|blue|↻}} restored`;
				logs.note = `${PROD_MESSAGE_PREFIX}it is NOT eligible for [[WP:SOFTDELETE|soft deletion]] because it was [{{fullurl:Special:Log|page={{urlencode:${target_page_title}}}}} previously undeleted (${new Date(log.timestamp).toLocaleDateString('en-US', { dateStyle: "medium" })})].`;
				break;
			case 'create':
				// type: 'create'
				if (logs.length === 0) {
					// Skip the first 'create'
					log_text = `${to_timestamp(log)} {{color|blue|✍️}} create`;
				}
				break;
			case 'delete_redir':
				// type: 'delete'
				break;
		}
		if (log_text) {
			logs.push(log_text);
		}
	}
	return logs;
}

// ----------------------------------------------------------------------------

const PROD_MESSAGE_PREFIX = "* '''Note to closer''': While this discussion appears to have [[WP:NOQUORUM|no quorum]], ";

async function for_AfD(AfD_page_data) {
	/** {String}target page title */
	const target_page_title = extract_target_page_of_AfD(AfD_page_data);
	if (!target_page_title) {
		CeL.error(`for_AfD: Can not extract target page title: ${CeL.wiki.title_link_of(AfD_page_data)}`);
		return;
	}

	const report_lines = [];

	const participations = check_AfD_participations(AfD_page_data);
	if (participations) {
		//return;
	}

	const target_page_data = this.page_data_hash[target_page_title] || await wiki.page(target_page_title);
	// console.log(target_page_data);
	if ('missing' in target_page_data)
		return;

	const result_notice_data = Object.create(null);

	function add_report_line(logs, title) {
		if (logs.length > 0) {
			report_lines.push(`'''${title}''': <code>${logs.join('</code>, <code>')}</code>`);
		}
	}

	// -------------------------------------------------------

	const redirect_to = CeL.wiki.parse.redirect(target_page_data);
	// CeL.info(`${CeL.wiki.title_link_of(AfD_page_data)}: redirect_to`);
	// console.log(redirect_to);
	if (redirect_to) {
		result_notice_data.redirect_to = redirect_to;
		result_notice_data.redirect = `${PROD_MESSAGE_PREFIX}it is NOT eligible for [[WP:SOFTDELETE|soft deletion]] because the subject is currently redirecting to ${CeL.wiki.title_link_of(redirect_to)}.`;
		report_lines.push(`Current redirect {{color|green|↪}} ${CeL.wiki.title_link_of(redirect_to)}`);
	}

	// -------------------------------------------------------

	const discussions = await get_AfD_discussions(target_page_title, AfD_page_data);
	//CeL.info(`${CeL.wiki.title_link_of(AfD_page_data)}: discussions`);
	//console.log(discussions);
	if (discussions) {
		if (discussions.result)
			result_notice_data.discussion = `${PROD_MESSAGE_PREFIX}it is NOT eligible for [[WP:SOFTDELETE|soft deletion]] because it was [[${discussions.result[1]}|previously discussed at AfD]] and the result was ${discussions.result[0]}.`;
		add_report_line(discussions.previous, 'Previous discussions');
		add_report_line(discussions.related, 'Related discussions');
	}

	// -------------------------------------------------------

	const logs = await get_AfD_logs(target_page_title, result_notice_data);
	if (logs.note) {
		result_notice_data.log = logs.note;
	}
	//CeL.info(`${CeL.wiki.title_link_of(AfD_page_data)}: logs`);
	//console.log(logs);
	// [{{fullurl:Special:Log|page=target_page_title}} Logs]
	add_report_line(logs, 'Logs');

	// -------------------------------------------------------

	if (report_lines.length === 0)
		return;

	let result_notice = result_notice_data.redirect || result_notice_data.discussion || result_notice_data.log
		|| `* '''Note to closer''': From lack of discussion, this nomination appears to have [[WP:NOQUORUM|no quorum]]. It seems no previous PRODs, previous AfD discussions, previous undeletions, ${result_notice_data.redirect_to ? '' : 'or a current redirect, '}so this nomination appears to be eligible for [[WP:SOFTDELETE|soft deletion]] at the end of its seven-day listing.`;

	if (participations) {
		result_notice = 'There are participations and the report will not shown in the [[deployment environment]]: '
			+ Object.keys(participations).map(type => participations[type].length > 0 && `${participations[type].length} ${type}`).filter(text => !!text).join(', ')
			+ '\n' + result_notice;
	} else {
		participations = "There is no participation and '''the report may show in the AfD'''."
			+ '\n' + result_notice;
	}

	report_lines.unshift(`=== ${CeL.wiki.title_link_of(AfD_page_data)} ===\n` + result_notice);
	//CeL.info(report_lines.join('\n: '));
	this.all_report_lines.push(report_lines.join('\n: '));
	// await wiki.edit_page(AfD_page_data, AfD_page_data.wikitext.replace(//));
}
