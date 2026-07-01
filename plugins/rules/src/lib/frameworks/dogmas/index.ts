import type { IDogmaAdapter } from '../contracts';

import { CSHARP_DOGMA } from './csharp.dogma';
import { ELIXIR_DOGMA } from './elixir.dogma';
import { GO_DOGMA } from './go.dogma';
import { JAVA_DOGMA } from './java.dogma';
import { KOTLIN_DOGMA } from './kotlin.dogma';
import { PYTHON_DOGMA } from './python.dogma';
import { RUBY_DOGMA } from './ruby.dogma';
import { RUST_DOGMA } from './rust.dogma';
import { SWIFT_DOGMA } from './swift.dogma';
import { TS_DOGMA } from './ts.dogma';
import { JS_DOGMA } from './js.dogma';
import { JSX_DOGMA } from './jsx.dogma';
import { TSX_DOGMA } from './tsx.dogma';
import { SCALA_DOGMA } from './scala.dogma';
import { GROOVY_DOGMA } from './groovy.dogma';
import { CLOJURE_DOGMA } from './clojure.dogma';
import { FS_DOGMA } from './fs.dogma';
import { VB_DOGMA } from './vb.dogma';
import { C_DOGMA } from './c.dogma';
import { CPP_DOGMA } from './cpp.dogma';
import { OBJC_DOGMA } from './objc.dogma';
import { OBJCPP_DOGMA } from './objcpp.dogma';
import { CARBON_DOGMA } from './carbon.dogma';
import { ZIG_DOGMA } from './zig.dogma';
import { NIM_DOGMA } from './nim.dogma';
import { CRYSTAL_DOGMA } from './crystal.dogma';
import { V_DOGMA } from './v.dogma';
import { PONY_DOGMA } from './pony.dogma';
import { HS_DOGMA } from './hs.dogma';
import { ML_DOGMA } from './ml.dogma';
import { PURESCRIPT_DOGMA } from './purescript.dogma';
import { ELM_DOGMA } from './elm.dogma';
import { IDRIS_DOGMA } from './idris.dogma';
import { AGDA_DOGMA } from './agda.dogma';
import { LEAN_DOGMA } from './lean.dogma';
import { COQ_DOGMA } from './coq.dogma';
import { ERL_DOGMA } from './erl.dogma';
import { GLEAM_DOGMA } from './gleam.dogma';
import { LFE_DOGMA } from './lfe.dogma';
import { CLJ_DOGMA } from './clj.dogma';
import { CLJS_DOGMA } from './cljs.dogma';
import { SCM_DOGMA } from './scm.dogma';
import { RKT_DOGMA } from './rkt.dogma';
import { EL_DOGMA } from './el.dogma';
import { PL_DOGMA } from './pl.dogma';
import { LUA_DOGMA } from './lua.dogma';
import { TCL_DOGMA } from './tcl.dogma';
import { PHP_DOGMA } from './php.dogma';
import { JL_DOGMA } from './jl.dogma';
import { DART_DOGMA } from './dart.dogma';
import { SH_DOGMA } from './sh.dogma';
import { PWSH_DOGMA } from './pwsh.dogma';
import { NU_DOGMA } from './nu.dogma';
import { FISH_DOGMA } from './fish.dogma';
import { R_DOGMA } from './r.dogma';
import { M_DOGMA } from './m.dogma';
import { SAS_DOGMA } from './sas.dogma';
import { MD_DOGMA } from './md.dogma';
import { ADOC_DOGMA } from './adoc.dogma';
import { RST_DOGMA } from './rst.dogma';
import { TEX_DOGMA } from './tex.dogma';
import { ORG_DOGMA } from './org.dogma';
import { TYPST_DOGMA } from './typst.dogma';
import { SQL_DOGMA } from './sql.dogma';
import { TOML_DOGMA } from './toml.dogma';
import { YAML_DOGMA } from './yaml.dogma';
import { JSON_DOGMA } from './json.dogma';
import { JSON5_DOGMA } from './json5.dogma';
import { HCL_DOGMA } from './hcl.dogma';
import { NIX_DOGMA } from './nix.dogma';
import { DHALL_DOGMA } from './dhall.dogma';
import { CUE_DOGMA } from './cue.dogma';
import { KDL_DOGMA } from './kdl.dogma';
import { HTML_DOGMA } from './html.dogma';
import { CSS_DOGMA } from './css.dogma';
import { SCSS_DOGMA } from './scss.dogma';
import { SASS_DOGMA } from './sass.dogma';
import { LESS_DOGMA } from './less.dogma';
import { PROTO_DOGMA } from './proto.dogma';
import { GRAPHQL_DOGMA } from './graphql.dogma';
import { OPENAPI_DOGMA } from './openapi.dogma';
import { AVSC_DOGMA } from './avsc.dogma';
import { THRIFT_DOGMA } from './thrift.dogma';
import { SOL_DOGMA } from './sol.dogma';
import { MOVE_DOGMA } from './move.dogma';
import { CAIRO_DOGMA } from './cairo.dogma';
import { VYPER_DOGMA } from './vyper.dogma';
import { IPYNB_DOGMA } from './ipynb.dogma';
import { RMD_DOGMA } from './rmd.dogma';
import { QMD_DOGMA } from './qmd.dogma';
import { CMAKE_DOGMA } from './cmake.dogma';
import { MAKE_DOGMA } from './make.dogma';
import { BAZEL_DOGMA } from './bazel.dogma';
import { BZL_DOGMA } from './bzl.dogma';
import { JUST_DOGMA } from './just.dogma';
import { NINJA_DOGMA } from './ninja.dogma';
import { VIM_DOGMA } from './vim.dogma';
import { RON_DOGMA } from './ron.dogma';

export {
	stringDogmaRenderer,
	DogmaRendererRegistry,
	type IDogmaRenderer,
	type IRenderedDogma,
} from './renderer';

export const DEFAULT_DOGMA_ADAPTERS: readonly IDogmaAdapter[] = [
	RUST_DOGMA,
	PYTHON_DOGMA,
	GO_DOGMA,
	RUBY_DOGMA,
	JAVA_DOGMA,
	KOTLIN_DOGMA,
	SWIFT_DOGMA,
	CSHARP_DOGMA,
	ELIXIR_DOGMA,
	TS_DOGMA,
	JS_DOGMA,
	JSX_DOGMA,
	TSX_DOGMA,
	SCALA_DOGMA,
	GROOVY_DOGMA,
	CLOJURE_DOGMA,
	FS_DOGMA,
	VB_DOGMA,
	C_DOGMA,
	CPP_DOGMA,
	OBJC_DOGMA,
	OBJCPP_DOGMA,
	CARBON_DOGMA,
	ZIG_DOGMA,
	NIM_DOGMA,
	CRYSTAL_DOGMA,
	V_DOGMA,
	PONY_DOGMA,
	HS_DOGMA,
	ML_DOGMA,
	PURESCRIPT_DOGMA,
	ELM_DOGMA,
	IDRIS_DOGMA,
	AGDA_DOGMA,
	LEAN_DOGMA,
	COQ_DOGMA,
	ERL_DOGMA,
	GLEAM_DOGMA,
	LFE_DOGMA,
	CLJ_DOGMA,
	CLJS_DOGMA,
	SCM_DOGMA,
	RKT_DOGMA,
	EL_DOGMA,
	PL_DOGMA,
	LUA_DOGMA,
	TCL_DOGMA,
	PHP_DOGMA,
	JL_DOGMA,
	DART_DOGMA,
	SH_DOGMA,
	PWSH_DOGMA,
	NU_DOGMA,
	FISH_DOGMA,
	R_DOGMA,
	M_DOGMA,
	SAS_DOGMA,
	MD_DOGMA,
	ADOC_DOGMA,
	RST_DOGMA,
	TEX_DOGMA,
	ORG_DOGMA,
	TYPST_DOGMA,
	SQL_DOGMA,
	TOML_DOGMA,
	YAML_DOGMA,
	JSON_DOGMA,
	JSON5_DOGMA,
	HCL_DOGMA,
	NIX_DOGMA,
	DHALL_DOGMA,
	CUE_DOGMA,
	KDL_DOGMA,
	HTML_DOGMA,
	CSS_DOGMA,
	SCSS_DOGMA,
	SASS_DOGMA,
	LESS_DOGMA,
	PROTO_DOGMA,
	GRAPHQL_DOGMA,
	OPENAPI_DOGMA,
	AVSC_DOGMA,
	THRIFT_DOGMA,
	SOL_DOGMA,
	MOVE_DOGMA,
	CAIRO_DOGMA,
	VYPER_DOGMA,
	IPYNB_DOGMA,
	RMD_DOGMA,
	QMD_DOGMA,
	CMAKE_DOGMA,
	MAKE_DOGMA,
	BAZEL_DOGMA,
	BZL_DOGMA,
	JUST_DOGMA,
	NINJA_DOGMA,
	VIM_DOGMA,
	RON_DOGMA,
];

export {
	RUST_DOGMA,
	PYTHON_DOGMA,
	GO_DOGMA,
	RUBY_DOGMA,
	JAVA_DOGMA,
	KOTLIN_DOGMA,
	SWIFT_DOGMA,
	CSHARP_DOGMA,
	ELIXIR_DOGMA,
	TS_DOGMA,
	JS_DOGMA,
	JSX_DOGMA,
	TSX_DOGMA,
	SCALA_DOGMA,
	GROOVY_DOGMA,
	CLOJURE_DOGMA,
	FS_DOGMA,
	VB_DOGMA,
	C_DOGMA,
	CPP_DOGMA,
	OBJC_DOGMA,
	OBJCPP_DOGMA,
	CARBON_DOGMA,
	ZIG_DOGMA,
	NIM_DOGMA,
	CRYSTAL_DOGMA,
	V_DOGMA,
	PONY_DOGMA,
	HS_DOGMA,
	ML_DOGMA,
	PURESCRIPT_DOGMA,
	ELM_DOGMA,
	IDRIS_DOGMA,
	AGDA_DOGMA,
	LEAN_DOGMA,
	COQ_DOGMA,
	ERL_DOGMA,
	GLEAM_DOGMA,
	LFE_DOGMA,
	CLJ_DOGMA,
	CLJS_DOGMA,
	SCM_DOGMA,
	RKT_DOGMA,
	EL_DOGMA,
	PL_DOGMA,
	LUA_DOGMA,
	TCL_DOGMA,
	PHP_DOGMA,
	JL_DOGMA,
	DART_DOGMA,
	SH_DOGMA,
	PWSH_DOGMA,
	NU_DOGMA,
	FISH_DOGMA,
	R_DOGMA,
	M_DOGMA,
	SAS_DOGMA,
	MD_DOGMA,
	ADOC_DOGMA,
	RST_DOGMA,
	TEX_DOGMA,
	ORG_DOGMA,
	TYPST_DOGMA,
	SQL_DOGMA,
	TOML_DOGMA,
	YAML_DOGMA,
	JSON_DOGMA,
	JSON5_DOGMA,
	HCL_DOGMA,
	NIX_DOGMA,
	DHALL_DOGMA,
	CUE_DOGMA,
	KDL_DOGMA,
	HTML_DOGMA,
	CSS_DOGMA,
	SCSS_DOGMA,
	SASS_DOGMA,
	LESS_DOGMA,
	PROTO_DOGMA,
	GRAPHQL_DOGMA,
	OPENAPI_DOGMA,
	AVSC_DOGMA,
	THRIFT_DOGMA,
	SOL_DOGMA,
	MOVE_DOGMA,
	CAIRO_DOGMA,
	VYPER_DOGMA,
	IPYNB_DOGMA,
	RMD_DOGMA,
	QMD_DOGMA,
	CMAKE_DOGMA,
	MAKE_DOGMA,
	BAZEL_DOGMA,
	BZL_DOGMA,
	JUST_DOGMA,
	NINJA_DOGMA,
	VIM_DOGMA,
	RON_DOGMA,
};
